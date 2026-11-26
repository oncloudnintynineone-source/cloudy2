"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { settings } from "@/db/schema";
import { AUDIT_ACTIONS, actorFromSession } from "@/lib/audit/build";
import { diffFields } from "@/lib/audit/diff";
import { logAction } from "@/lib/audit/log";
import { invalidateConfigCache } from "@/lib/configCache";
import {
  gibToBytes,
  mibToBytes,
  validateMetricsForm,
  type MetricsFormValues,
} from "@/lib/metrics/validate";
import { requireAdmin } from "@/lib/session";
import { runMetricsSnapshot } from "@/lib/metrics/snapshot";

export interface SnapshotNowResult {
  ok: boolean;
  /** Days this run closed — usually one, more when earlier days were missed. */
  days?: string[];
  /** Set when there was nothing to do, so the button can say why. */
  skipped?: string;
  error?: string;
}

/**
 * Close today's ledger row on demand (Resource Usage → Snapshot now).
 *
 * Force-bypasses the configured window but not the once-per-day claim, so
 * pressing it twice cannot double-count a day. Audited inside
 * `runMetricsSnapshot` as `metrics.snapshot` — an admin-initiated write always
 * leaves a trail, even when the write is "only" a measurement.
 */
export async function runSnapshotNowAction(): Promise<SnapshotNowResult> {
  const session = await requireAdmin();

  const result = await runMetricsSnapshot({
    trigger: "manual",
    force: true,
    actor: {
      id: session.user.id,
      name: session.user.name ?? null,
      role: session.user.role,
    },
  });

  if (result.error) {
    return { ok: false, error: result.error };
  }
  if (result.days.length === 0) {
    return { ok: true, days: [], skipped: result.skipped ?? "already-closed" };
  }

  // Drop the cached summary so the page re-reads the day it just wrote.
  revalidatePath("/settings/metrics");
  return { ok: true, days: result.days };
}

export interface MetricsSettingsResult {
  ok: boolean;
  error?: string;
  field?: keyof MetricsFormValues;
}

/**
 * Persist the ledger configuration (Settings → Resource Usage): the snapshot
 * schedule, the Neon caps, the calibration ratio, and retention.
 *
 * The caps are stored in bytes and edited in GiB/MiB/hours; the conversion
 * happens here, once, at the boundary. Audited as a settings update with a
 * field diff, because "who moved the cap" is the first question after a budget
 * bar changes colour on its own.
 */
export async function saveMetricsSettings(
  values: MetricsFormValues,
): Promise<MetricsSettingsResult> {
  const session = await requireAdmin();

  const errors = validateMetricsForm(values);
  const firstField = Object.keys(errors)[0] as keyof MetricsFormValues | undefined;
  if (firstField) {
    return { ok: false, error: errors[firstField]!, field: firstField };
  }

  const snapshotDays = [...new Set(values.snapshotDays.filter((day) => day >= 1 && day <= 7))].sort(
    (a, b) => a - b,
  );
  const next = {
    metricsEnabled: values.enabled,
    metricsSnapshotTime: values.snapshotTime.trim(),
    metricsSnapshotDays: snapshotDays,
    metricsNeonCapComputeHours: values.capComputeHours,
    metricsNeonCapEgressBytes: gibToBytes(values.capEgressGiB),
    metricsNeonCapStorageBytes: mibToBytes(values.capStorageMiB),
    metricsEgressCalibration: values.calibration,
    metricsRetentionDays: Math.round(values.retentionDays),
  };

  const [before] = await db.select().from(settings).limit(1);
  await db.update(settings).set({ ...next, updatedAt: new Date() }).where(eq(settings.id, "singleton"));

  const beforeValues = {
    metricsEnabled: before?.metricsEnabled ?? null,
    metricsSnapshotTime: before?.metricsSnapshotTime ?? null,
    metricsSnapshotDays: before?.metricsSnapshotDays ?? null,
    metricsNeonCapComputeHours: before?.metricsNeonCapComputeHours ?? null,
    metricsNeonCapEgressBytes: before?.metricsNeonCapEgressBytes ?? null,
    metricsNeonCapStorageBytes: before?.metricsNeonCapStorageBytes ?? null,
    metricsEgressCalibration: before?.metricsEgressCalibration ?? null,
    metricsRetentionDays: before?.metricsRetentionDays ?? null,
  };

  await logAction({
    ...actorFromSession(session),
    action: AUDIT_ACTIONS.settingsUpdate,
    entityType: "settings",
    entityName: "settings",
    method: "saveMetricsSettings",
    details: diffFields(beforeValues, { ...beforeValues, ...next }),
  });

  invalidateConfigCache(["settings", "metricsLedger"]);
  revalidatePath("/settings/metrics");
  return { ok: true };
}
