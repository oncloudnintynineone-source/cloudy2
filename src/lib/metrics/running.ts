/**
 * The running-counter writer — the missing half of the egress estimate.
 *
 * The daily snapshot closes a day out of `metrics_running` (the additive
 * per-`(day, metric, label)` counters), but nothing used to write that table:
 * the collector read "whatever the instances flushed", and no instance ever
 * flushed anything, so the Egress bar sat at a permanent zero. This module is
 * the flusher the schema comment always promised
 * (`src/db/schema.ts` — "merged here with `value = value + excluded.value`,
 * flushed at most once every few minutes per instance and only when
 * non-zero").
 *
 * Accounting is done at the response boundary of the app's hottest reads
 * (`/api/dashboard/load`, `/api/dashboard/preload`): the bytes the route ships
 * are the bytes the app pulled from Postgres to build them, which is what Neon
 * bills from the other side of the wire. The calibration ratio in Settings is
 * the honest bridge to Neon's own figure — this number is an estimate of the
 * dominant traffic, not a packet capture.
 *
 * Like the activity writer, everything here is best-effort and off the request
 * path: counters accumulate in a module-level buffer and merge into the table
 * inside `after()`, at most once a minute per instance. A scale-to-zero
 * suspend loses at most the last minute of counts — the same trade the
 * activity set makes, and the reason the merge is additive.
 */

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { metricsRunning } from "@/db/schema";

import { METRICS_RUNNING_BUFFER_MAX, METRICS_RUNNING_FLUSH_MS } from "./config";
import { METRICS } from "./metrics";
import { metricsSnapshotDate } from "./schedule";

/** One route's pending counts for one ledger day. */
interface RouteCounts {
  requests: number;
  errors: number;
  egressBytes: number;
}

/** `day` → `route` → pending counts. Keyed by day so a flush that lands past
 *  midnight still attributes each request to the day it happened. */
const buffer = new Map<string, Map<string, RouteCounts>>();

let lastFlushAt = 0;
let flushing: Promise<void> | null = null;

function addCounts(day: string, route: string, counts: RouteCounts): void {
  let routes = buffer.get(day);
  if (!routes) {
    routes = new Map();
    buffer.set(day, routes);
  }
  const existing = routes.get(route);
  if (existing) {
    existing.requests += counts.requests;
    existing.errors += counts.errors;
    existing.egressBytes += counts.egressBytes;
  } else {
    routes.set(route, { ...counts });
  }
}

/**
 * Count one API response: +1 request, +1 error when it failed, and the bytes
 * it shipped as the day's app-accounted egress for that route. Pure buffer
 * bookkeeping — no I/O, safe to call inline before the response is returned.
 */
export function recordRouteResponse(route: string, bytes: number, ok: boolean): void {
  addCounts(metricsSnapshotDate(new Date()), route, {
    requests: 1,
    errors: ok ? 0 : 1,
    egressBytes: Number.isFinite(bytes) && bytes > 0 ? bytes : 0,
  });
}

/** How many buffered `(day, route)` rows are waiting. */
function bufferedRows(): number {
  let total = 0;
  for (const routes of buffer.values()) {
    total += routes.size;
  }
  return total;
}

/**
 * Merge the buffer into `metrics_running` when it is due: non-empty, and either
 * the flush interval has passed or the buffer outgrew its memory guard. Called
 * from `after()` beside `recordActivityMinute`, so it rides the same wake-ups.
 * Concurrent calls share one in-flight flush; failures are swallowed and the
 * counts go back into the buffer for the next attempt.
 */
export function maybeFlushRunningCounters(now: Date = new Date()): Promise<void> {
  if (bufferedRows() === 0) {
    return Promise.resolve();
  }
  const due =
    now.getTime() - lastFlushAt >= METRICS_RUNNING_FLUSH_MS ||
    bufferedRows() >= METRICS_RUNNING_BUFFER_MAX;
  if (!due) {
    return Promise.resolve();
  }
  if (flushing) {
    // A flush already in flight: its drain happened before these counts
    // arrived, so the overflow simply waits for the next request's pass.
    return flushing;
  }
  flushing = flushRunningCounters(now).finally(() => {
    flushing = null;
  });
  return flushing;
}

/** Drain the buffer into the table. Exported for tests and the flush itself;
 *  callers on the request path want {@link maybeFlushRunningCounters}. */
export async function flushRunningCounters(now: Date = new Date()): Promise<void> {
  // Marked before the write, so a failed merge also waits out the interval —
  // a deliberate backoff: a DB that just refused a metrics write should not be
  // retried on every request.
  lastFlushAt = now.getTime();
  // Snapshot and clear first: requests that land while the merge is in flight
  // buffer fresh and are carried by the next flush, never lost or doubled.
  const pending = [...buffer.entries()].flatMap(([day, routes]) =>
    [...routes.entries()].map(([route, counts]) => ({ day, route, counts })),
  );
  buffer.clear();
  if (pending.length === 0) {
    return;
  }

  const values = pending.flatMap(({ day, route, counts }) => {
    const rows: { day: string; metric: string; labelKey: string; value: number }[] = [
      { day, metric: METRICS.appRequests, labelKey: `route=${route}`, value: counts.requests },
    ];
    if (counts.egressBytes > 0) {
      rows.push({
        day,
        metric: METRICS.appEgressBytes,
        labelKey: `route=${route}`,
        value: counts.egressBytes,
      });
    }
    if (counts.errors > 0) {
      rows.push({
        day,
        metric: METRICS.appErrors,
        labelKey: `route=${route}`,
        value: counts.errors,
      });
    }
    return rows;
  });

  try {
    await db
      .insert(metricsRunning)
      .values(values)
      .onConflictDoUpdate({
        target: [metricsRunning.day, metricsRunning.metric, metricsRunning.labelKey],
        set: {
          // Additive merge — the whole point of the table: instances converge
          // on the day's total without ever reading it first.
          value: sql`${metricsRunning.value} + excluded.value`,
          updatedAt: new Date(),
        },
      });
  } catch (error) {
    // Swallowed like the activity writer's: a metrics write must not break a
    // response path. The drained counts go back into the buffer (additively,
    // so anything recorded during the failed merge is kept) for the next flush.
    console.error("[metrics] running counter flush failed", error);
    for (const { day, route, counts } of pending) {
      addCounts(day, route, counts);
    }
  }
}

/** Test seam: drop the buffer and the throttle without touching the DB. */
export function resetRunningCountersForTests(): void {
  buffer.clear();
  lastFlushAt = 0;
  flushing = null;
}
