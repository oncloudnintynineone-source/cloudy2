/**
 * Thresholds for the ledger's health strip and budget bars.
 *
 * Two severities only — `watch` (amber, act this week) and `critical` (red,
 * act now) — because a third tier becomes noise nobody acts on. Every rule
 * here is a *symptom* the admin can act on, not a number that merely looks
 * busy: nothing in this list fires unless there is a decision attached to it
 * (raise a cap, ship an egress fix, add an index, vacuum a table).
 *
 * Pure, so the colours in the UI and the warnings in the tab pill come from the
 * same arithmetic and can be unit-tested without a database.
 */

import { METRICS_THRESHOLD_CRITICAL, METRICS_THRESHOLD_WATCH } from "./config";
import { METRICS } from "./metrics";

export type ThresholdStatus = "ok" | "watch" | "critical" | "unknown";

/** Rank so a page can take the worst status across its chips. */
const RANK: Record<ThresholdStatus, number> = {
  unknown: -1,
  ok: 0,
  watch: 1,
  critical: 2,
};

export function worstStatus(...statuses: ThresholdStatus[]): ThresholdStatus {
  return statuses.reduce<ThresholdStatus>(
    (worst, status) => (RANK[status] > RANK[worst] ? status : worst),
    "ok",
  );
}

/** Fraction of a cap consumed → status. Null (no cap / no data) is `unknown`. */
export function statusForFraction(
  fraction: number | null | undefined,
  watch = METRICS_THRESHOLD_WATCH,
  critical = METRICS_THRESHOLD_CRITICAL,
): ThresholdStatus {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) {
    return "unknown";
  }
  if (fraction >= critical) {
    return "critical";
  }
  if (fraction >= watch) {
    return "watch";
  }
  return "ok";
}

interface ValueRule {
  watch: number;
  critical: number;
  /** True when a bigger number is the bad direction (the common case). */
  higherIsWorse: boolean;
}

/**
 * Per-metric rules for the values that are not "fraction of a cap".
 *
 * The numbers come from this deployment's shape, not from a generic runbook:
 * the pool is `DB_POOL_MAX` (3) per instance against 4 instances, so 10
 * connections is saturation rather than a curiosity; and a transaction left
 * idle for half a minute is what starves that pool.
 */
const VALUE_RULES: Partial<Record<string, ValueRule>> = {
  [METRICS.dbCacheHitRatio]: { watch: 0.95, critical: 0.9, higherIsWorse: false },
  [METRICS.dbIdleInTxSecondsMax]: { watch: 30, critical: 120, higherIsWorse: true },
  [METRICS.dbConnectionsPeak]: { watch: 10, critical: 16, higherIsWorse: true },
  [METRICS.dbDeadlocks]: { watch: 1, critical: 5, higherIsWorse: true },
  [METRICS.appDispatchFailure]: { watch: 1, critical: 10, higherIsWorse: true },
};

/** Status for a stored metric value against its rule; `unknown` when it has none. */
export function statusForMetric(name: string, value: number | null | undefined): ThresholdStatus {
  const rule = VALUE_RULES[name];
  if (!rule || value === null || value === undefined || !Number.isFinite(value)) {
    return "unknown";
  }
  const breachedCritical = rule.higherIsWorse ? value >= rule.critical : value <= rule.critical;
  if (breachedCritical) {
    return "critical";
  }
  const breachedWatch = rule.higherIsWorse ? value >= rule.watch : value <= rule.watch;
  return breachedWatch ? "watch" : "ok";
}

/** Error rate (errors / requests) → status. Below 20 requests the rate is noise. */
export function statusForErrorRate(errors: number, requests: number): ThresholdStatus {
  if (requests < 20) {
    return "unknown";
  }
  return statusForFraction(errors / requests, 0.005, 0.01);
}

/**
 * Whether the tab deserves its amber pill: any budget projection at `watch` or
 * worse. This is the whole forewarning mechanism — the page does not have to be
 * opened for the wall to be noticed.
 */
export function shouldWarnOnPill(statuses: readonly ThresholdStatus[]): boolean {
  return statuses.some((status) => status === "watch" || status === "critical");
}
