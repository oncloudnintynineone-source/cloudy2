/**
 * Pure validation for the ledger's configuration (Settings → Resource Usage).
 *
 * The caps are entered in the units a person thinks in — GiB of egress, MiB of
 * storage, hours of compute — and converted to bytes at the boundary. Asking an
 * admin to type `5368709120` to mean "5 GB" is how a monitoring tool ends up
 * configured with a typo nobody notices.
 */

import { METRICS_RETENTION_MAX, METRICS_RETENTION_MIN } from "./config";

/** `HH:mm`, 24-hour, Singapore time — the same shape as the parade-email cutoff. */
export const METRICS_SNAPSHOT_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const GIB = 1024 * 1024 * 1024;
export const MIB = 1024 * 1024;

export const METRICS_CAP_COMPUTE_HOURS_MIN = 1;
export const METRICS_CAP_COMPUTE_HOURS_MAX = 100_000;
export const METRICS_CAP_EGRESS_GIB_MIN = 0.1;
export const METRICS_CAP_EGRESS_GIB_MAX = 1024;
export const METRICS_CAP_STORAGE_MIB_MIN = 1;
export const METRICS_CAP_STORAGE_MIB_MAX = 1_048_576;
export const METRICS_CALIBRATION_MIN = 0.05;
export const METRICS_CALIBRATION_MAX = 100;

export interface MetricsFormValues {
  enabled: boolean;
  /** UTC+8 cutoff (`HH:mm`) after which the lazy tick may snapshot. */
  snapshotTime: string;
  /** ISO weekdays (1=Mon … 7=Sun) a snapshot is taken on. */
  snapshotDays: number[];
  capComputeHours: number;
  capEgressGiB: number;
  capStorageMiB: number;
  /** Multiplier applied to the app's byte estimate to reach Neon's figure. */
  calibration: number;
  retentionDays: number;
}

export type MetricsFormErrors = Partial<Record<keyof MetricsFormValues, string>>;

export function validateMetricsForm(values: MetricsFormValues): MetricsFormErrors {
  const errors: MetricsFormErrors = {};

  const time = values.snapshotTime.trim();
  if (!time) {
    errors.snapshotTime = "Snapshot time is required";
  } else if (!METRICS_SNAPSHOT_TIME_PATTERN.test(time)) {
    errors.snapshotTime = "Enter a valid time (HH:mm)";
  }

  if (values.snapshotDays.length === 0) {
    errors.snapshotDays = "Select at least one day";
  }

  if (!inRange(values.capComputeHours, METRICS_CAP_COMPUTE_HOURS_MIN, METRICS_CAP_COMPUTE_HOURS_MAX)) {
    errors.capComputeHours = `Enter between ${METRICS_CAP_COMPUTE_HOURS_MIN} and ${METRICS_CAP_COMPUTE_HOURS_MAX} hours`;
  }
  if (!inRange(values.capEgressGiB, METRICS_CAP_EGRESS_GIB_MIN, METRICS_CAP_EGRESS_GIB_MAX)) {
    errors.capEgressGiB = `Enter between ${METRICS_CAP_EGRESS_GIB_MIN} and ${METRICS_CAP_EGRESS_GIB_MAX} GiB`;
  }
  if (!inRange(values.capStorageMiB, METRICS_CAP_STORAGE_MIB_MIN, METRICS_CAP_STORAGE_MIB_MAX)) {
    errors.capStorageMiB = `Enter between ${METRICS_CAP_STORAGE_MIB_MIN} and ${METRICS_CAP_STORAGE_MIB_MAX} MiB`;
  }
  if (!inRange(values.calibration, METRICS_CALIBRATION_MIN, METRICS_CALIBRATION_MAX)) {
    errors.calibration = `Enter between ${METRICS_CALIBRATION_MIN} and ${METRICS_CALIBRATION_MAX}`;
  }
  if (!inRange(values.retentionDays, METRICS_RETENTION_MIN, METRICS_RETENTION_MAX)) {
    errors.retentionDays = `Keep between ${METRICS_RETENTION_MIN} and ${METRICS_RETENTION_MAX} days`;
  }

  return errors;
}

function inRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

/** Bytes → GiB for the form field, rounded to two decimals so the value round-trips. */
export function bytesToGiB(bytes: number): number {
  return round(bytes / GIB, 3);
}

/** Bytes → MiB for the form field. */
export function bytesToMiB(bytes: number): number {
  return round(bytes / MIB, 2);
}

export function gibToBytes(gib: number): number {
  return Math.round(gib * GIB);
}

export function mibToBytes(mib: number): number {
  return Math.round(mib * MIB);
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
