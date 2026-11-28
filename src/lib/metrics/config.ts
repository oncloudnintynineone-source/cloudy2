/**
 * Tunables and defaults for the resource-usage ledger (Settings → Resource Usage).
 *
 * Kept free of I/O and framework code so it unit-tests without a database, and
 * imported by `src/db/schema.ts` for the settings column defaults — the same
 * shape the parade-email defaults use (`src/lib/parade-email/emailDefaults.ts`).
 *
 * Why these numbers exist at all: the Neon consumption API is a paid-plan
 * feature (it answers 403 "included with Launch plans and above" on the free
 * tier), so the caps below are the app's own record of the ceiling it is
 * measuring itself against. They are admin-editable — the day the deployment
 * moves to a paid plan, the numbers change here and in Settings, and nothing
 * else about the ledger does.
 */

/**
 * Default daily snapshot cutoff (UTC+8 `HH:mm`) — the earliest time of day the
 * lazy close may run. Deliberately just after midnight: the close covers the
 * day that has already ended, so the first morning visit does it. An
 * end-of-day cutoff would never fire for an office-hours app (nobody has it
 * open at 23:55), which is how the ledger once shipped "No data" forever.
 */
export const METRICS_DEFAULT_SNAPSHOT_TIME = "00:05";

/** ISO weekdays (1=Mon … 7=Sun) a snapshot is taken on. Daily by default. */
export const METRICS_DEFAULT_SNAPSHOT_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** Neon free-tier compute allowance (active hours per month). */
export const METRICS_DEFAULT_CAP_COMPUTE_HOURS = 100;

/** Neon free-tier public egress allowance (5 GiB per month). */
export const METRICS_DEFAULT_CAP_EGRESS_BYTES = 5 * 1024 * 1024 * 1024;

/** Neon free-tier storage allowance (0.5 GiB). */
export const METRICS_DEFAULT_CAP_STORAGE_BYTES = 512 * 1024 * 1024;

/** Ledger retention (days). Daily rows are tiny, so the default keeps a year. */
export const METRICS_RETENTION_DEFAULT = 365;
export const METRICS_RETENTION_MIN = 30;
export const METRICS_RETENTION_MAX = 730;

/**
 * How long a snapshot claim stays owned before another instance may retry it.
 * Generous because the collector is a handful of catalog reads; short enough
 * that a crashed instance cannot block the day.
 */
export const METRICS_SNAPSHOT_LEASE_MS = 10 * 60 * 1000;

/** A failed/partial claim may be retried after this much time. */
export const METRICS_SNAPSHOT_RETRY_MS = 5 * 60 * 1000;

/**
 * The client tick's throttle window. Longer than the parade email's (5 min):
 * the snapshot is due once a day, so a ping per quarter-hour of continuous
 * use is plenty, and every ping costs a settings read.
 */
export const METRICS_TICK_THROTTLE_MS = 15 * 60 * 1000;

/**
 * Minimum interval between running-counter flushes per instance. Same cadence
 * as the activity-minute writer, and it rides the same `after()` hook, so a
 * flush never costs a database wake-up the app did not already pay for.
 */
export const METRICS_RUNNING_FLUSH_MS = 60 * 1000;

/**
 * Memory guard for the running-counter buffer: a route fan-out wider than this
 * many distinct `(day, metric, label)` rows flushes immediately rather than
 * growing the map.
 */
export const METRICS_RUNNING_BUFFER_MAX = 256;

/** Days of ledger the page loads by default. */
export const METRICS_LEDGER_DEFAULT_DAYS = 30;
export const METRICS_LEDGER_MAX_DAYS = 366;

/**
 * Budget bars turn amber/critical at these fractions of a cap. Two tiers only
 * (watch / critical) — a third becomes noise nobody acts on.
 */
export const METRICS_THRESHOLD_WATCH = 0.7;
export const METRICS_THRESHOLD_CRITICAL = 0.9;

/**
 * How many top tables / top queries a day's `detail` jsonb keeps. Bounds the
 * row size and keeps the ledger's own storage cost trivial next to the 0.5 GiB
 * it is watching.
 */
export const METRICS_DETAIL_TOP_N = 20;

/**
 * Minimum samples before the page projects a month-end date from a daily
 * average. Below this the projection is noise, so the page says "too little
 * data" instead of inventing a date.
 */
export const METRICS_PROJECTION_MIN_DAYS = 3;

/**
 * The activity set: minute-of-day indices (0 … 1439) the app touched the
 * database on, union-merged across instances so a distinct-minute count is
 * exact even though up to four Cloud Run instances write it concurrently.
 */
export const METRICS_MINUTES_PER_DAY = 1440;

/**
 * Neon's scale-to-zero timeout is fixed at 5 minutes on the free plan. The
 * estimator uses it as the ceiling for an observed awake span: if the app saw
 * the endpoint twice within this window it was awake the whole time; a longer
 * gap means it suspended in between.
 */
export const METRICS_SUSPEND_GAP_SECONDS = 5 * 60;
