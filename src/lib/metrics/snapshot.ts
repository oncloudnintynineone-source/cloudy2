/**
 * Snapshot orchestration: the once-a-day claim plus the run itself.
 *
 * The mechanism is deliberately the parade-state email's (`docs/parade-state-email.md`
 * §1.4/§1.5): there is no external scheduler in this deployment, so a lazy
 * in-app tick asks "is the window open?", a unique claim row makes the answer
 * idempotent across devices and instances, and the work happens in `after()`
 * so no user's request waits on a catalog read.
 *
 * Two consequences worth stating because they are the parts that surprise
 * people: a day nobody was online for is **closed late, not skipped** (every
 * counter is date-keyed, so a late run still writes the right day), and benign
 * skips are **not audited** — an audit row per app open would drown the log,
 * while one row per real snapshot is exactly the evidence "did it run?" needs.
 */

import { and, eq, lt, or, sql } from "drizzle-orm";
import { hostname } from "node:os";

import { db } from "@/db";
import { metricsClaim } from "@/db/schema";
import { AUDIT_ACTIONS } from "@/lib/audit/build";
import { logAction } from "@/lib/audit/log";
import { getSettings } from "@/lib/settings/queries";

import { METRICS_SNAPSHOT_LEASE_MS } from "./config";
import { collectDaySnapshot, latestClosedDay, type SnapshotResult } from "./collect";
import {
  metricsSnapshotDate,
  metricsSnapshotWindowOpen,
  pendingSnapshotDays,
  shiftDate,
  type MetricsSnapshotWindowReason,
} from "./schedule";

const CLAIM_KIND = "snapshot";

export interface SnapshotActor {
  id: string | null;
  name: string | null;
  role: string;
}

export interface RunMetricsSnapshotInput {
  trigger: "opportunistic" | "manual";
  /** Close today regardless of the configured window (the admin button). */
  force?: boolean;
  actor?: SnapshotActor;
}

export interface SnapshotRunSummary {
  ran: boolean;
  skipped?: MetricsSnapshotWindowReason | "already-closed";
  days: string[];
  results: SnapshotResult[];
  error?: string;
}

/**
 * Claim one day's snapshot. True when this caller owns it: either the row was
 * inserted here, or a previous attempt failed or its lease expired.
 */
async function claimDay(day: string): Promise<boolean> {
  const instance = hostname();
  const inserted = await db
    .insert(metricsClaim)
    .values({ kind: CLAIM_KIND, day, status: "claimed", instance })
    .onConflictDoNothing({ target: [metricsClaim.kind, metricsClaim.day] })
    .returning({ kind: metricsClaim.kind });
  if (inserted.length > 0) {
    return true;
  }

  const staleBefore = new Date(Date.now() - METRICS_SNAPSHOT_LEASE_MS);
  const reclaimed = await db
    .update(metricsClaim)
    .set({
      status: "claimed",
      claimedAt: new Date(),
      instance,
      finishedAt: null,
      error: null,
      attempts: sql`${metricsClaim.attempts} + 1`,
    })
    .where(
      and(
        eq(metricsClaim.kind, CLAIM_KIND),
        eq(metricsClaim.day, day),
        or(eq(metricsClaim.status, "failed"), lt(metricsClaim.claimedAt, staleBefore)),
      ),
    )
    .returning({ kind: metricsClaim.kind });
  return reclaimed.length > 0;
}

async function finishClaim(
  day: string,
  status: "done" | "failed",
  error: string | null,
): Promise<void> {
  await db
    .update(metricsClaim)
    .set({ status, finishedAt: new Date(), error })
    .where(and(eq(metricsClaim.kind, CLAIM_KIND), eq(metricsClaim.day, day)));
}

/**
 * Run one snapshot pass: gate, find the days that still need closing, close
 * them oldest-first. Never throws — the lazy tick calls it from `after()`, and
 * a failure is recorded on the claim so the next tick retries.
 */
export async function runMetricsSnapshot(
  input: RunMetricsSnapshotInput,
): Promise<SnapshotRunSummary> {
  const now = new Date();
  const today = metricsSnapshotDate(now);

  try {
    const config = await getSettings();

    if (!input.force) {
      const window = metricsSnapshotWindowOpen({
        enabled: config.metricsEnabled,
        now,
        snapshotTime: config.metricsSnapshotTime,
        days: config.metricsSnapshotDays,
      });
      if (!window.open) {
        return { ran: false, skipped: window.reason, days: [], results: [] };
      }
    } else if (!config.metricsEnabled) {
      return { ran: false, skipped: "disabled", days: [], results: [] };
    }

    // The lazy pass closes completed days only (through yesterday): the day
    // still in progress would be frozen at whatever fraction the cutoff saw,
    // and an office-hours app never has activity near an end-of-day cutoff
    // anyway. The forced button closes through today — pressing it means
    // "close now, partial and all" (src/lib/metrics/schedule.ts).
    const lastClosedDay = await latestClosedDay();
    const latestDay = input.force ? today : shiftDate(today, -1);
    const days = pendingSnapshotDays({ lastClosedDay, today, latestDay });
    if (days.length === 0) {
      return { ran: false, skipped: "already-closed", days: [], results: [] };
    }

    const results: SnapshotResult[] = [];
    const closed: string[] = [];
    for (const day of days) {
      if (!(await claimDay(day))) {
        continue;
      }
      try {
        results.push(await collectDaySnapshot(day));
        closed.push(day);
        await finishClaim(day, "done", null);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await finishClaim(day, "failed", message).catch(() => {});
        console.error("[metrics] snapshot collection failed", { day, error });
        // Stop the pass: a failing catalog read will fail for the next day too,
        // and retrying it on every app open is exactly the load this avoids.
        return {
          ran: closed.length > 0,
          days: closed,
          results,
          error: message,
        };
      }
    }

    if (closed.length > 0) {
      await auditRun(input, closed, results);
    }

    return {
      ran: closed.length > 0,
      skipped: closed.length > 0 ? undefined : "already-closed",
      days: closed,
      results,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[metrics] snapshot pass failed", error);
    if (input.trigger === "manual") {
      await logAction({
        actorId: input.actor?.id ?? null,
        actorName: input.actor?.name ?? null,
        actorRole: input.actor?.role ?? "system",
        action: AUDIT_ACTIONS.metricsSnapshot,
        entityType: "metricsSnapshot",
        entityName: today,
        method: "runMetricsSnapshot",
        details: { outcome: "failed", trigger: input.trigger, error: message },
      });
    }
    return { ran: false, days: [], results: [], error: message };
  }
}

/**
 * One flat, human-readable audit row per snapshot pass — the ledger's own
 * "did it run, and what did it see" trail. Payloads stay flat per the audit-log
 * convention (`docs/audit-log.md`), so the row is readable without a JSON viewer.
 */
async function auditRun(
  input: RunMetricsSnapshotInput,
  days: string[],
  results: SnapshotResult[],
): Promise<void> {
  const last = results[results.length - 1];
  await logAction({
    actorId: input.actor?.id ?? null,
    actorName: input.actor?.name ?? null,
    actorRole: input.actor?.role ?? "system",
    action: AUDIT_ACTIONS.metricsSnapshot,
    entityType: "metricsSnapshot",
    entityName: days.join(", "),
    method: "runMetricsSnapshot",
    details: {
      outcome: "closed",
      trigger: input.trigger,
      days: days.join(", "),
      rows: results.reduce((sum, result) => sum + result.rowsWritten, 0),
      storage: last?.storageBytes != null ? `${last.storageBytes} bytes` : null,
      active_minutes: last?.activeMinutes ?? null,
      wakeups: last?.wakeups ?? null,
      egress_bytes: last?.egressBytes ?? null,
      statements: last?.statementsInstalled ? "installed" : "not installed",
      gap_days: last?.gapDays ?? 0,
      unavailable: last?.unavailable?.length ? last.unavailable.join(", ") : null,
    },
  });
}

/**
 * The lazy tick's entry point. Called from `after()` on authenticated
 * activity; the pure window gate inside runs before any ledger read, so the
 * common "not due yet" case costs one cached settings read.
 */
export async function maybeRunMetricsSnapshot(): Promise<void> {
  await runMetricsSnapshot({ trigger: "opportunistic" });
}
