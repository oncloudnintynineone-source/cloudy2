/**
 * The ledger's metric catalogue: every name written to `metrics_day` /
 * `metrics_running`, its unit, and where the number comes from.
 *
 * Three sources, and the distinction is load-bearing for the UI:
 *  - `sql`       read straight out of Postgres — exact (`pg_database_size`, …)
 *  - `app`       counted by the app itself (requests, bytes pulled) — exact for
 *                what it measures, blind to anything it does not read
 *  - `estimate`  derived, because Neon's own figure needs a paid plan
 *                (active compute hours, egress) — always labelled as such
 *
 * Adding a metric means adding a name here plus the writer; the page renders
 * whatever the catalogue knows about, so an unknown stored metric still shows
 * as a raw row rather than vanishing.
 */

export type MetricUnit = "bytes" | "minutes" | "seconds" | "ratio" | "count" | "epoch";
export type MetricSource = "sql" | "app" | "estimate";

export interface MetricDef {
  /** Stable stored key — renaming one is a data migration, not a refactor. */
  name: string;
  /** Short label for tables and chart titles. */
  label: string;
  unit: MetricUnit;
  source: MetricSource;
  /** One-line explanation shown in the metric's tooltip/caption. */
  description: string;
  /** True when the metric is a per-day total (sum) rather than a level. */
  cumulative?: boolean;
}

export const METRICS = {
  // — Storage: exact, and the only cap measurable to the byte on a free plan.
  storageDbBytes: "storage.db_bytes",
  storageTableBytes: "storage.table_bytes",
  storageCachePayloadBytes: "storage.cache_payload_bytes",

  // — Compute: Neon bills wall-clock time the endpoint is awake. The API that
  //    reports it is paid-plan, so these are derived from the app's own traffic
  //    plus the exact anchors Postgres does expose.
  computeActiveMinutes: "compute.active_minutes",
  computeEndpointWakeups: "compute.endpoint_wakeups",
  computeEndpointAwakeSeconds: "compute.endpoint_awake_seconds",

  // — Database health, diffed from cumulative catalog counters.
  dbCacheHitRatio: "db.cache_hit_ratio",
  dbTempBytes: "db.temp_bytes",
  dbDeadlocks: "db.deadlocks",
  dbXactCommit: "db.xact_commit",
  dbXactRollback: "db.xact_rollback",
  dbConnectionsPeak: "db.connections_peak",
  dbIdleInTxSecondsMax: "db.idle_in_tx_seconds_max",
  dbQueryTop: "db.query_top",
  dbStatsResetEpoch: "db.stats_reset_epoch",

  // — Bloat / vacuum, for the tables the app writes hardest.
  bloatDeadTuples: "bloat.dead_tuples",
  bloatLastAutovacuumEpoch: "bloat.last_autovacuum_epoch",

  // — App-side accounting: the only way to see egress without the paid API.
  appRequests: "app.requests",
  appErrors: "app.errors",
  appEgressBytes: "app.egress_bytes",
  appRowsRead: "app.rows_read",
  appCacheRead: "app.cache_read",
  appDispatchFailure: "app.dispatch_failure",
} as const;

export type MetricName = (typeof METRICS)[keyof typeof METRICS];

export const METRIC_DEFS: readonly MetricDef[] = [
  {
    name: METRICS.storageDbBytes,
    label: "Database size",
    unit: "bytes",
    source: "sql",
    description: "pg_database_size at snapshot time — exact, and it counts toward the storage cap.",
  },
  {
    name: METRICS.storageTableBytes,
    label: "Table size",
    unit: "bytes",
    source: "sql",
    description: "pg_total_relation_size per table (indexes and TOAST included).",
  },
  {
    name: METRICS.storageCachePayloadBytes,
    label: "Event-cache payload",
    unit: "bytes",
    source: "sql",
    description:
      "Bytes stored in google_event_cache payloads — the object the app reads most, so the clearest lever on egress.",
  },
  {
    name: METRICS.computeActiveMinutes,
    label: "Active compute",
    unit: "minutes",
    source: "estimate",
    description:
      "Distinct minutes the app touched the database, from a per-minute activity set merged across instances. Neon's own active-time figure needs a paid plan; this tracks the same thing from the inside.",
    cumulative: true,
  },
  {
    name: METRICS.computeEndpointWakeups,
    label: "Endpoint wake-ups",
    unit: "count",
    source: "estimate",
    description:
      "Cold resumes inferred from gaps in the activity set: any gap longer than Neon's fixed 5-minute suspend timeout means the endpoint slept and had to wake. Each one costs a cold connect.",
    cumulative: true,
  },
  {
    name: METRICS.computeEndpointAwakeSeconds,
    label: "Endpoint awake (last span)",
    unit: "seconds",
    source: "sql",
    description:
      "How long the compute endpoint had been continuously awake at snapshot time, read straight from pg_postmaster_start_time().",
  },
  {
    name: METRICS.dbCacheHitRatio,
    label: "Cache hit ratio",
    unit: "ratio",
    source: "sql",
    description: "Blocks served from cache over blocks read, diffed across the day.",
  },
  {
    name: METRICS.dbTempBytes,
    label: "Temp bytes",
    unit: "bytes",
    source: "sql",
    description: "Disk spilled by sorts and hashes — a sign a query wants an index.",
    cumulative: true,
  },
  {
    name: METRICS.dbDeadlocks,
    label: "Deadlocks",
    unit: "count",
    source: "sql",
    description: "Deadlocks detected in the day.",
    cumulative: true,
  },
  {
    name: METRICS.dbXactCommit,
    label: "Committed transactions",
    unit: "count",
    source: "sql",
    description: "Transactions committed in the day.",
    cumulative: true,
  },
  {
    name: METRICS.dbXactRollback,
    label: "Rolled-back transactions",
    unit: "count",
    source: "sql",
    description: "Transactions rolled back in the day — a rising share usually means errors.",
    cumulative: true,
  },
  {
    name: METRICS.dbConnectionsPeak,
    label: "Connection peak",
    unit: "count",
    source: "sql",
    description:
      "Highest connection count seen for this database between snapshots, against the app's small pool.",
  },
  {
    name: METRICS.dbIdleInTxSecondsMax,
    label: "Longest idle-in-transaction",
    unit: "seconds",
    source: "sql",
    description: "Longest transaction left open doing nothing — it holds one of the pool's slots.",
  },
  {
    name: METRICS.dbQueryTop,
    label: "Top queries",
    unit: "count",
    source: "sql",
    description: "Top statements by total time, from pg_stat_statements when the extension is on.",
  },
  {
    name: METRICS.dbStatsResetEpoch,
    label: "Stats reset",
    unit: "epoch",
    source: "sql",
    description: "When Postgres statistics were last reset; a reset makes day-over-day deltas lie.",
  },
  {
    name: METRICS.bloatDeadTuples,
    label: "Dead tuples",
    unit: "count",
    source: "sql",
    description: "Rows awaiting vacuum on a hot table.",
  },
  {
    name: METRICS.bloatLastAutovacuumEpoch,
    label: "Last autovacuum",
    unit: "epoch",
    source: "sql",
    description: "When autovacuum last visited a hot table.",
  },
  {
    name: METRICS.appRequests,
    label: "Requests",
    unit: "count",
    source: "app",
    description: "Requests served, per route template.",
    cumulative: true,
  },
  {
    name: METRICS.appErrors,
    label: "Errors",
    unit: "count",
    source: "app",
    description: "Failed requests (5xx or thrown), per route template.",
    cumulative: true,
  },
  {
    name: METRICS.appEgressBytes,
    label: "Bytes read from Postgres",
    unit: "bytes",
    source: "app",
    description:
      "Bytes the app pulled over the wire, per route. This is the egress estimate: Neon bills the same traffic from the other side.",
    cumulative: true,
  },
  {
    name: METRICS.appRowsRead,
    label: "Rows read",
    unit: "count",
    source: "app",
    description: "Rows returned, per route.",
    cumulative: true,
  },
  {
    name: METRICS.appCacheRead,
    label: "Event-cache reads",
    unit: "count",
    source: "app",
    description: "Month-cache reads by outcome: hit, stale (served while revalidating), or miss.",
    cumulative: true,
  },
  {
    name: METRICS.appDispatchFailure,
    label: "Background dispatch failures",
    unit: "count",
    source: "app",
    description:
      "Best-effort after() work that failed and was swallowed: audit write, KAH notify, Web Push, webhook.",
    cumulative: true,
  },
];

const DEF_BY_NAME = new Map(METRIC_DEFS.map((def) => [def.name, def]));

/** The catalogue entry for a stored metric name; unknown names still render. */
export function metricDef(name: string): MetricDef {
  return (
    DEF_BY_NAME.get(name) ?? {
      name,
      label: name,
      unit: "count",
      source: "sql",
      description: "Unrecognised metric key — written by a newer release than this page.",
    }
  );
}

/**
 * Canonical `label_key` for a metric row: sorted `k=v` pairs joined by `|`, so
 * two instances building the same labels independently collide on the primary
 * key and merge instead of duplicating. Empty object → `""` (the unlabelled row).
 */
export function labelKey(labels: Record<string, string | number>): string {
  const keys = Object.keys(labels);
  if (keys.length === 0) {
    return "";
  }
  return keys
    .sort()
    .map((key) => `${key}=${labels[key]}`)
    .join("|");
}

/** Inverse of {@link labelKey}, for rendering a stored row's dimensions. */
export function parseLabelKey(key: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!key) {
    return out;
  }
  for (const part of key.split("|")) {
    const eq = part.indexOf("=");
    if (eq > 0) {
      out[part.slice(0, eq)] = part.slice(eq + 1);
    }
  }
  return out;
}
