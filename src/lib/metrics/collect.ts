/**
 * The daily snapshot collector.
 *
 * Reads the resource picture out of Postgres and the day's running counters,
 * differences the cumulative catalog counters against the previous snapshot,
 * and closes the day into `metrics_day`. Called from the lazy tick inside
 * `after()` (and from the admin's "Snapshot now" button), never on a user's
 * request path.
 *
 * Two constraints shape the code:
 *
 * 1. **It must not become the thing it measures.** Every signal is folded into
 *    as few round trips as Postgres allows — the whole core picture is one
 *    statement — because this deployment pays for database activity in compute
 *    hours, the very budget the page reports on.
 * 2. **A missing number stays missing.** `pg_stat_statements` is not installed
 *    on every environment, and a catalog view can be denied. Each optional read
 *    degrades to `null` and is reported in the result, so the page says "not
 *    installed" instead of showing a confident zero.
 */

import { desc, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { metricsActivity, metricsDay, metricsRunning } from "@/db/schema";

import { METRICS_DETAIL_TOP_N } from "./config";
import {
  activeMinutes,
  diffCounters,
  endpointAwakeSeconds,
  wakeupsFromActivity,
  type DbCounters,
} from "./estimate";
import { METRICS } from "./metrics";

/** The tables the bloat/vacuum panel follows — the app's hottest writers. */
const HOT_TABLES = ["audit_logs", "google_event_cache", "user_dashboard_views", "users"];

export interface TopQuery {
  queryId: string;
  snippet: string;
  calls: number;
  totalMs: number;
  meanMs: number;
  rows: number;
}

export interface TableUsage {
  table: string;
  bytes: number;
  deadTuples: number;
  lastAutovacuumEpoch: number | null;
}

export interface SnapshotResult {
  day: string;
  rowsWritten: number;
  storageBytes: number | null;
  activeMinutes: number;
  wakeups: number;
  /** Raw app-accounted bytes before the calibration ratio is applied. */
  egressBytes: number;
  statementsInstalled: boolean;
  /** Days this snapshot spans because earlier days were never closed. */
  gapDays: number;
  /** Catalog reads that failed or were unavailable, for the status panel. */
  unavailable: string[];
}

/** The cumulative counters stored with the baseline row, for the next diff. */
interface Baseline {
  day: string;
  counters: DbCounters;
}

function num(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optNum(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The core picture in one statement: database size, the endpoint's own start
 * time, and the cumulative `pg_stat_database` counters. One round trip because
 * every extra one is billed in the currency this page reports on.
 */
async function readCore(): Promise<{
  dbBytes: number;
  endpointStartEpoch: number | null;
  nowEpoch: number;
  counters: DbCounters;
} | null> {
  const rows = (await db.execute(sql`
    SELECT
      pg_database_size(current_database()) AS db_bytes,
      EXTRACT(EPOCH FROM pg_postmaster_start_time())::bigint AS endpoint_start_epoch,
      EXTRACT(EPOCH FROM now())::bigint AS now_epoch,
      coalesce(stats.blks_hit, 0) AS blks_hit,
      coalesce(stats.blks_read, 0) AS blks_read,
      coalesce(stats.temp_bytes, 0) AS temp_bytes,
      coalesce(stats.deadlocks, 0) AS deadlocks,
      coalesce(stats.xact_commit, 0) AS xact_commit,
      coalesce(stats.xact_rollback, 0) AS xact_rollback,
      EXTRACT(EPOCH FROM stats.stats_reset)::bigint AS stats_reset_epoch
    FROM pg_stat_database stats
    WHERE stats.datname = current_database()
  `)) as unknown as Record<string, unknown>[];
  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    dbBytes: num(row.db_bytes),
    endpointStartEpoch: optNum(row.endpoint_start_epoch),
    nowEpoch: num(row.now_epoch),
    counters: {
      blksHit: num(row.blks_hit),
      blksRead: num(row.blks_read),
      tempBytes: num(row.temp_bytes),
      deadlocks: num(row.deadlocks),
      xactCommit: num(row.xact_commit),
      xactRollback: num(row.xact_rollback),
      statsResetAt: optNum(row.stats_reset_epoch),
    },
  };
}

/** Per-table size and vacuum state, hottest first. */
async function readTables(): Promise<TableUsage[]> {
  const rows = (await db.execute(sql`
    SELECT
      stats.relname AS table_name,
      pg_total_relation_size(stats.relid)::bigint AS bytes,
      coalesce(stats.n_dead_tup, 0) AS dead_tuples,
      EXTRACT(EPOCH FROM stats.last_autovacuum)::bigint AS last_autovacuum_epoch
    FROM pg_stat_user_tables stats
    ORDER BY pg_total_relation_size(stats.relid) DESC
    LIMIT ${METRICS_DETAIL_TOP_N}
  `)) as unknown as Record<string, unknown>[];
  return rows.map((row) => ({
    table: String(row.table_name),
    bytes: num(row.bytes),
    deadTuples: num(row.dead_tuples),
    lastAutovacuumEpoch: optNum(row.last_autovacuum_epoch),
  }));
}

/**
 * Bytes held in the month cache — the object the app reads most, so the single
 * clearest lever on egress. Counts the legacy jsonb payload too: rows are only
 * rewritten in the compressed form when their month next refreshes, and stale
 * months never refresh, so a payload-only sum would quietly understate storage.
 */
async function readCachePayloadBytes(): Promise<number | null> {
  const rows = (await db.execute(sql`
    SELECT
      coalesce(sum(octet_length(payload)), 0)::bigint
      + coalesce(sum(octet_length(events::text)), 0)::bigint AS payload_bytes
    FROM google_event_cache
  `)) as unknown as Record<string, unknown>[];
  return rows[0] ? num(rows[0].payload_bytes) : null;
}

/** Connections for this database and the longest idle-in-transaction. */
async function readConnections(): Promise<{ connections: number; idleTxSeconds: number } | null> {
  const rows = (await db.execute(sql`
    SELECT
      count(*)::int AS connections,
      coalesce(
        max(EXTRACT(EPOCH FROM (now() - state_change)))
          FILTER (WHERE state = 'idle in transaction'),
        0
      )::int AS idle_tx_seconds
    FROM pg_stat_activity
    WHERE datname = current_database()
  `)) as unknown as Record<string, unknown>[];
  const row = rows[0];
  return row ? { connections: num(row.connections), idleTxSeconds: num(row.idle_tx_seconds) } : null;
}

/** Top statements, when `pg_stat_statements` exists. Null when it does not. */
async function readTopQueries(): Promise<TopQuery[] | null> {
  if (!(await statementsInstalled())) {
    return null;
  }
  const rows = (await db.execute(sql`
    SELECT
      queryid::text AS query_id,
      substring(regexp_replace(query, '\\s+', ' ', 'g') from 1 for 200) AS snippet,
      calls::bigint AS calls,
      round(total_exec_time::numeric, 1)::float AS total_ms,
      round(mean_exec_time::numeric, 2)::float AS mean_ms,
      rows::bigint AS rows_read
    FROM pg_stat_statements
    WHERE calls > 0
      AND userid = (SELECT usesysid FROM pg_user WHERE usename = current_user)
    ORDER BY total_exec_time DESC
    LIMIT ${METRICS_DETAIL_TOP_N}
  `)) as unknown as Record<string, unknown>[];
  return rows.map((row) => ({
    queryId: String(row.query_id),
    snippet: String(row.snippet ?? ""),
    calls: num(row.calls),
    totalMs: num(row.total_ms),
    meanMs: num(row.mean_ms),
    rows: num(row.rows_read),
  }));
}

/** The cumulative baseline stored by the most recent snapshot, if any. */
async function readBaseline(): Promise<Baseline | null> {
  const [row] = await db
    .select({ day: metricsDay.day, detail: metricsDay.detail })
    .from(metricsDay)
    .where(eq(metricsDay.metric, METRICS.dbStatsResetEpoch))
    .orderBy(desc(metricsDay.day))
    .limit(1);
  if (!row) {
    return null;
  }
  const detail = (row.detail ?? {}) as Partial<DbCounters>;
  if (
    typeof detail.blksHit !== "number" ||
    typeof detail.blksRead !== "number" ||
    typeof detail.xactCommit !== "number"
  ) {
    return null;
  }
  return {
    day: String(row.day),
    counters: {
      blksHit: detail.blksHit,
      blksRead: detail.blksRead,
      tempBytes: typeof detail.tempBytes === "number" ? detail.tempBytes : 0,
      deadlocks: typeof detail.deadlocks === "number" ? detail.deadlocks : 0,
      xactCommit: detail.xactCommit,
      xactRollback: typeof detail.xactRollback === "number" ? detail.xactRollback : 0,
      statsResetAt: typeof detail.statsResetAt === "number" ? detail.statsResetAt : null,
    },
  };
}

type DayRow = typeof metricsDay.$inferInsert;

/**
 * Close one ledger day. Idempotent: re-running replaces the day's rows rather
 * than adding to them, which is what makes a retried claim safe.
 */
export async function collectDaySnapshot(day: string): Promise<SnapshotResult> {
  const unavailable: string[] = [];

  const [activityRow, runningRows] = await Promise.all([
    db
      .select({ minutes: metricsActivity.minutes })
      .from(metricsActivity)
      .where(eq(metricsActivity.day, day))
      .then((rows) => rows[0] ?? null),
    db.select().from(metricsRunning).where(eq(metricsRunning.day, day)),
  ]);

  const minutes = normalizeMinutes(activityRow?.minutes);
  const dayActiveMinutes = activeMinutes(minutes);
  const wakeups = wakeupsFromActivity(minutes);

  const core = await readCore().catch(() => {
    unavailable.push("pg_stat_database");
    return null;
  });
  const tables = await readTables().catch(() => {
    unavailable.push("pg_stat_user_tables");
    return [] as TableUsage[];
  });
  const cachePayloadBytes = await readCachePayloadBytes().catch(() => {
    unavailable.push("google_event_cache");
    return null;
  });
  const connections = await readConnections().catch(() => {
    unavailable.push("pg_stat_activity");
    return null;
  });
  const topQueries = await readTopQueries().catch(() => {
    unavailable.push("pg_stat_statements");
    return null;
  });

  const baseline = await readBaseline().catch(() => null);
  const counters = core?.counters ?? null;
  const delta = counters ? diffCounters(baseline?.counters ?? null, counters) : null;
  const gapDays = baseline ? Math.max(0, dayDiff(baseline.day, day)) : 0;

  const rows: DayRow[] = [];
  const push = (
    metric: string,
    value: number | null | undefined,
    source: "sql" | "app" | "estimate",
    labelKey = "",
    detail?: unknown,
  ) => {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return;
    }
    rows.push({ day, metric, labelKey, value, source, detail: detail ?? null });
  };

  // — Storage: exact.
  push(METRICS.storageDbBytes, core?.dbBytes, "sql");
  push(METRICS.storageCachePayloadBytes, cachePayloadBytes, "sql");
  for (const table of tables) {
    push(METRICS.storageTableBytes, table.bytes, "sql", `table=${table.table}`);
    if (HOT_TABLES.includes(table.table)) {
      push(METRICS.bloatDeadTuples, table.deadTuples, "sql", `table=${table.table}`);
      push(
        METRICS.bloatLastAutovacuumEpoch,
        table.lastAutovacuumEpoch,
        "sql",
        `table=${table.table}`,
      );
    }
  }

  // — Compute: derived, and labelled derived.
  push(METRICS.computeActiveMinutes, dayActiveMinutes, "estimate");
  push(METRICS.computeEndpointWakeups, wakeups, "estimate");
  if (core && core.endpointStartEpoch !== null) {
    push(
      METRICS.computeEndpointAwakeSeconds,
      endpointAwakeSeconds(core.endpointStartEpoch, core.nowEpoch),
      "sql",
    );
  }

  // — Database health: differences of cumulative counters.
  push(METRICS.dbCacheHitRatio, delta?.cacheHitRatio, "sql");
  push(METRICS.dbTempBytes, delta?.tempBytes, "sql");
  push(METRICS.dbDeadlocks, delta?.deadlocks, "sql");
  push(METRICS.dbXactCommit, delta?.xactCommit, "sql");
  push(METRICS.dbXactRollback, delta?.xactRollback, "sql");
  push(METRICS.dbConnectionsPeak, connections?.connections, "sql");
  push(METRICS.dbIdleInTxSecondsMax, connections?.idleTxSeconds, "sql");
  // The baseline row carries the raw cumulative counters the next snapshot
  // differences against, plus the reason a difference had to be discarded.
  push(METRICS.dbStatsResetEpoch, counters?.statsResetAt ?? 0, "sql", "", {
    ...(counters ?? {}),
    baselineDay: baseline?.day ?? null,
    gapDays,
    reset: delta?.reset ?? false,
    first: delta?.first ?? true,
  });

  // — App-side counters: whatever the instances flushed for this day.
  let egressBytes = 0;
  for (const row of runningRows) {
    if (row.metric === METRICS.appEgressBytes) {
      egressBytes += row.value;
    }
    rows.push({
      day,
      metric: row.metric,
      labelKey: row.labelKey,
      value: row.value,
      source: "app",
      detail: null,
    });
  }

  if (topQueries) {
    rows.push({
      day,
      metric: METRICS.dbQueryTop,
      labelKey: "",
      value: topQueries.reduce((sum, query) => sum + query.calls, 0),
      source: "sql",
      detail: topQueries,
    });
  }

  if (rows.length > 0) {
    await db
      .insert(metricsDay)
      .values(rows)
      .onConflictDoUpdate({
        target: [metricsDay.day, metricsDay.metric, metricsDay.labelKey],
        set: {
          value: sql`excluded.value`,
          source: sql`excluded.source`,
          detail: sql`excluded.detail`,
          snapshotAt: sql`excluded.snapshot_at`,
        },
      });
  }

  return {
    day,
    rowsWritten: rows.length,
    storageBytes: core?.dbBytes ?? null,
    activeMinutes: dayActiveMinutes,
    wakeups,
    egressBytes,
    statementsInstalled: topQueries !== null,
    gapDays,
    unavailable,
  };
}

/** Whether `pg_stat_statements` is installed — the status panel asks live. */
export async function statementsInstalled(): Promise<boolean> {
  try {
    const rows = (await db.execute(
      sql`SELECT 1 AS ok FROM pg_extension WHERE extname = 'pg_stat_statements'`,
    )) as unknown as unknown[];
    return rows.length > 0;
  } catch {
    return false;
  }
}

/** The most recent closed ledger day, or null when the ledger is empty. */
export async function latestClosedDay(): Promise<string | null> {
  const [row] = await db
    .select({ day: metricsDay.day })
    .from(metricsDay)
    .orderBy(desc(metricsDay.day))
    .limit(1);
  return row ? String(row.day) : null;
}

function normalizeMinutes(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((minute): minute is number => typeof minute === "number") : [];
}

function dayDiff(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) {
    return 0;
  }
  return Math.round((b - a) / 86_400_000);
}
