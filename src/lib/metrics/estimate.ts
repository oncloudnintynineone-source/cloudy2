/**
 * The estimator math behind the ledger's non-exact numbers.
 *
 * Neon's usage API is paid-plan only, so two of the three caps have to be
 * derived: **active compute time** from the minutes the app actually touched
 * the database, and **egress** from the bytes the app actually pulled. Both are
 * estimates, and this module is where that honesty is defined rather than
 * hand-waved at render time — every function here returns `null`/`insufficient`
 * instead of inventing a number.
 *
 * Pure and I/O-free so the whole of "how do we know we're about to run out?"
 * is unit-testable without a database.
 */

import {
  METRICS_MINUTES_PER_DAY,
  METRICS_PROJECTION_MIN_DAYS,
  METRICS_SUSPEND_GAP_SECONDS,
} from "./config";

// — Activity set ——————————————————————————————————————————————————————————

/**
 * Normalise minute-of-day indices into the canonical stored form: valid,
 * de-duplicated, ascending. Out-of-range entries are dropped rather than
 * clamped — a bogus index means a bug at the call site, and clamping would
 * hide it as a phantom active minute.
 */
export function normalizeActivityMinutes(minutes: readonly number[]): number[] {
  const seen = new Set<number>();
  for (const minute of minutes) {
    if (Number.isInteger(minute) && minute >= 0 && minute < METRICS_MINUTES_PER_DAY) {
      seen.add(minute);
    }
  }
  return [...seen].sort((a, b) => a - b);
}

/** Distinct active minutes — the number the compute estimate is built from. */
export function activeMinutes(minutes: readonly number[]): number {
  return normalizeActivityMinutes(minutes).length;
}

/** Active minutes → hours, the unit the Neon compute cap is quoted in. */
export function minutesToHours(minutes: number): number {
  return minutes / 60;
}

/**
 * The current minute-of-day on the UTC+8 clock the ledger is keyed to. The
 * activity set records this once per minute per instance, which is what keeps
 * the write volume at "one merge per flush window" instead of per request.
 */
export function minuteOfDay(hours: number, minutes: number): number {
  return Math.min(METRICS_MINUTES_PER_DAY - 1, Math.max(0, hours * 60 + minutes));
}

// — Endpoint awake spans ——————————————————————————————————————————————————

/**
 * How long the compute endpoint had been continuously awake.
 *
 * `pg_postmaster_start_time()` is exact and free, so this is the one compute
 * number that is a measurement rather than an inference: the endpoint has been
 * up since that instant. It is capped at a day purely so a clock anomaly
 * cannot produce a four-digit "awake" figure.
 */
export function endpointAwakeSeconds(startEpochSeconds: number, nowEpochSeconds: number): number {
  const seconds = Math.floor(nowEpochSeconds - startEpochSeconds);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return 0;
  }
  return Math.min(seconds, 86_400);
}

/**
 * Whether two endpoint start times mean the endpoint suspended in between —
 * the detector behind the wake-up counter. A missing reading (a failed probe)
 * is `null` and never counts as a wake-up, so a flaky read cannot inflate it.
 */
export function isEndpointRestart(
  previous: number | null,
  current: number | null,
): boolean {
  if (previous === null || current === null) {
    return false;
  }
  return current > previous;
}

/**
 * Endpoint wake-ups implied by the activity set: every gap between two active
 * minutes longer than Neon's fixed 5-minute suspend timeout means the endpoint
 * went to sleep and had to be woken again. Derived from data already collected
 * rather than polled, so counting cold starts costs no extra round trips — and
 * unlike a once-a-day `pg_postmaster_start_time()` comparison, it cannot miss
 * the dozens of resumes a quiet afternoon actually contains.
 */
export function wakeupsFromActivity(
  minutes: readonly number[],
  suspendGapMinutes = METRICS_SUSPEND_GAP_SECONDS / 60,
): number {
  const sorted = normalizeActivityMinutes(minutes);
  let wakeups = 0;
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index] - sorted[index - 1] > suspendGapMinutes) {
      wakeups += 1;
    }
  }
  return wakeups;
}

// — Cumulative catalog counters ———————————————————————————————————————————

/**
 * Raw cumulative counters from `pg_stat_database`. Postgres only ever adds to
 * these (they reset on `stats_reset` or a crash-recovery), so a day's value is
 * the difference between two readings — and a reset makes the difference lie,
 * which is why the baseline carries `statsResetAt` alongside it.
 */
export interface DbCounters {
  blksHit: number;
  blksRead: number;
  tempBytes: number;
  deadlocks: number;
  xactCommit: number;
  xactRollback: number;
  /** Epoch seconds of the last stats reset; null when never reset. */
  statsResetAt: number | null;
}

export interface DbCountersDelta {
  /** Null when no baseline exists yet or the counters were reset — never a fake zero. */
  blksHit: number | null;
  blksRead: number | null;
  tempBytes: number | null;
  deadlocks: number | null;
  xactCommit: number | null;
  xactRollback: number | null;
  cacheHitRatio: number | null;
  /** True when a stats reset made the day-over-day difference meaningless. */
  reset: boolean;
  /** True when this was the first reading, so there is nothing to difference. */
  first: boolean;
}

/** Difference two cumulative readings, detecting a reset instead of trusting it. */
export function diffCounters(prev: DbCounters | null, next: DbCounters): DbCountersDelta {
  if (!prev) {
    return {
      blksHit: null,
      blksRead: null,
      tempBytes: null,
      deadlocks: null,
      xactCommit: null,
      xactRollback: null,
      cacheHitRatio: null,
      reset: false,
      first: true,
    };
  }
  if ((prev.statsResetAt ?? 0) !== (next.statsResetAt ?? 0)) {
    return {
      blksHit: null,
      blksRead: null,
      tempBytes: null,
      deadlocks: null,
      xactCommit: null,
      xactRollback: null,
      cacheHitRatio: null,
      reset: true,
      first: false,
    };
  }
  const delta = (a: number, b: number): number => Math.max(0, b - a);
  const blksHit = delta(prev.blksHit, next.blksHit);
  const blksRead = delta(prev.blksRead, next.blksRead);
  return {
    blksHit,
    blksRead,
    tempBytes: delta(prev.tempBytes, next.tempBytes),
    deadlocks: delta(prev.deadlocks, next.deadlocks),
    xactCommit: delta(prev.xactCommit, next.xactCommit),
    xactRollback: delta(prev.xactRollback, next.xactRollback),
    cacheHitRatio: cacheHitRatio(blksHit, blksRead),
    reset: false,
    first: false,
  };
}

/** Blocks served from cache over blocks touched; null when nothing was read. */
export function cacheHitRatio(hits: number, reads: number): number | null {
  const total = hits + reads;
  if (total <= 0) {
    return null;
  }
  return hits / total;
}

// — Budget projection —————————————————————————————————————————————————————

export interface ProjectionInput {
  /** Sum of the metric over the month's closed days. */
  monthToDate: number;
  /** How many days that sum covers. */
  daysCounted: number;
  /** Day of the month today falls on (1-based). */
  dayOfMonth: number;
  /** Days in the current month. */
  daysInMonth: number;
  /** The cap being measured against. */
  cap: number;
  /** Below this many days of data the projection is noise, so it is withheld. */
  minDays?: number;
}

export interface Projection {
  /** Mean per-day consumption across the counted days. */
  dailyMean: number;
  /** Where the running total lands at month end if the rate holds. */
  projectedMonthEnd: number;
  /** Fraction of the cap consumed so far; null when the cap is unset. */
  usedFraction: number | null;
  /** Fraction of the cap projected at month end. */
  projectedFraction: number | null;
  /** Day-of-month the cap is crossed, or null when the month survives it. */
  capDay: number | null;
  /** Days left before the cap is crossed, from today; null when not crossed. */
  daysToCap: number | null;
  /** True when there is too little data to project — the UI says so plainly. */
  insufficientData: boolean;
}

/**
 * Project a daily-consumption metric against a monthly cap.
 *
 * The rate is the observed mean, not a linear extrapolation of the calendar:
 * this app's traffic is weekday office hours, so a calendar-linear projection
 * would predict a wall two days early every month.
 */
export function projectToCap(input: ProjectionInput): Projection {
  const minDays = input.minDays ?? METRICS_PROJECTION_MIN_DAYS;
  const hasCap = Number.isFinite(input.cap) && input.cap > 0;
  const usedFraction = hasCap ? input.monthToDate / input.cap : null;
  const insufficient = input.daysCounted < minDays || input.monthToDate <= 0;

  const dailyMean = input.daysCounted > 0 ? input.monthToDate / input.daysCounted : 0;
  const remainingDays = Math.max(0, input.daysInMonth - input.daysCounted);
  const projectedMonthEnd = input.monthToDate + dailyMean * remainingDays;
  const projectedFraction = hasCap ? projectedMonthEnd / input.cap : null;

  let capDay: number | null = null;
  let daysToCap: number | null = null;
  if (hasCap && !insufficient && dailyMean > 0 && input.monthToDate < input.cap) {
    const daysNeeded = Math.ceil((input.cap - input.monthToDate) / dailyMean);
    const absolute = input.daysCounted + daysNeeded;
    if (absolute <= input.daysInMonth) {
      capDay = Math.min(input.daysInMonth, input.dayOfMonth + daysNeeded);
      daysToCap = Math.max(0, daysNeeded);
    }
  } else if (hasCap && input.monthToDate >= input.cap) {
    // Already over: the honest answer is "now", not a date in the past.
    capDay = input.dayOfMonth;
    daysToCap = 0;
  }

  return {
    dailyMean,
    projectedMonthEnd,
    usedFraction,
    projectedFraction,
    capDay,
    daysToCap,
    insufficientData: insufficient,
  };
}

/**
 * Apply the admin's calibration ratio to the app's own byte accounting.
 *
 * The ratio is the one honest bridge to Neon's figure: paste the month's real
 * egress from Neon Console once, and the estimate is scaled to agree with it.
 * Non-finite or non-positive input falls back to 1 (uncalibrated) rather than
 * silently zeroing the estimate.
 */
export function calibrateBytes(bytes: number, ratio: number): number {
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  return Math.max(0, bytes) * safeRatio;
}

/** Days in a `YYYY-MM` month. */
export function daysInMonth(yearMonth: string): number {
  const [year, month] = yearMonth.split("-").map(Number);
  if (!year || !month) {
    return 30;
  }
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The `YYYY-MM` a `YYYY-MM-DD` ledger date belongs to. */
export function monthOfDay(day: string): string {
  return day.slice(0, 7);
}

/** Day-of-month for a `YYYY-MM-DD` ledger date (1-based). */
export function dayOfMonth(day: string): number {
  const value = Number(day.slice(8, 10));
  return Number.isFinite(value) && value > 0 ? value : 1;
}
