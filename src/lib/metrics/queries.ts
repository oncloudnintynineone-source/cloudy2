/**
 * Read side of the resource ledger — everything the Resource Usage page shows.
 *
 * The page reads `metrics_day` and nothing else expensive: the ledger is a few
 * dozen rows a day, so a full window is one indexed read. That is deliberate.
 * A monitoring page that re-queries `pg_stat_database` on every poll would add
 * the very load it reports on, and this deployment pays for database activity
 * in the compute hours the page is watching.
 *
 * The one live probe is `pg_stat_statements` presence, because "which query
 * drove it?" needs to say *now* whether it can be answered at all.
 */

import { desc, eq, gte } from "drizzle-orm";

import { db } from "@/db";
import { metricsClaim, metricsDay } from "@/db/schema";
import { cachedConfig } from "@/lib/configCache";
import { getSettings } from "@/lib/settings/queries";

import { METRICS_LEDGER_DEFAULT_DAYS } from "./config";
import { statementsInstalled } from "./collect";
import {
  calibrateBytes,
  dayOfMonth,
  daysInMonth,
  monthOfDay,
  projectToCap,
  type Projection,
} from "./estimate";
import { METRICS, METRIC_DEFS, parseLabelKey, type MetricSource, type MetricUnit } from "./metrics";
import { metricsSnapshotDate } from "./schedule";
import {
  shouldWarnOnPill,
  statusForErrorRate,
  statusForFraction,
  statusForMetric,
  worstStatus,
  type ThresholdStatus,
} from "./thresholds";

export interface LedgerDayRow {
  day: string;
  storageBytes: number | null;
  activeMinutes: number | null;
  wakeups: number | null;
  /** Calibrated app-accounted bytes; null on days with no app accounting. */
  egressBytes: number | null;
  requests: number | null;
  errors: number | null;
  cacheHitRatio: number | null;
  connectionsPeak: number | null;
  /** The single route that moved the most bytes that day. */
  topRoute: { route: string; bytes: number } | null;
}

export interface BudgetBar {
  key: "storage" | "compute" | "egress";
  label: string;
  /** What the number is, in words — "current size" vs "this month". */
  basis: string;
  used: number;
  cap: number;
  unit: "bytes" | "hours";
  /** Null for a level metric (storage) — a level does not accumulate. */
  projection: Projection | null;
  status: ThresholdStatus;
  /** True when the figure is derived rather than measured. */
  estimated: boolean;
  note: string | null;
}

export interface DayDetail {
  day: string;
  topQueries: unknown;
  topRoutes: { route: string; bytes: number; requests: number }[];
  cacheReads: { result: string; count: number }[];
  dispatchFailures: { kind: string; count: number }[];
  gapDays: number;
  statsReset: boolean;
}

export interface SourceStatus {
  key: string;
  label: string;
  state: "ok" | "unavailable" | "not-installed" | "pending";
  detail: string;
}

export interface MetricOption {
  name: string;
  label: string;
  unit: MetricUnit;
  source: MetricSource;
  description: string;
}

export interface LedgerSummary {
  latestDay: string | null;
  today: string;
  generatedAt: number;
  /** Worst status across every budget and health signal on the page. */
  status: ThresholdStatus;
  budgets: BudgetBar[];
  days: LedgerDayRow[];
  /**
   * Drill-down detail for the most recent closed days, newest first. Built from
   * the rows already in memory, so it costs no extra query — the window is
   * capped purely to keep the page's initial payload small.
   */
  details: DayDetail[];
  sources: SourceStatus[];
  pill: { warn: boolean; count: number };
  enabled: boolean;
  snapshotTime: string;
  retentionDays: number;
  calibration: number;
}

type DayRecord = typeof metricsDay.$inferSelect;

/**
 * Everything the page needs, in one read of the ledger.
 *
 * Cached for 60s (`CONFIG_CACHE_KEYS.metricsLedger`) because the settings
 * layout calls it on every `/settings/*` render to light the tab's warning
 * pill; `force` bypasses the cache for the page's own refresh.
 */
export function getLedgerSummary(
  days: number = METRICS_LEDGER_DEFAULT_DAYS,
  options: { force?: boolean } = {},
): Promise<LedgerSummary> {
  const load = () => loadLedgerSummary(days);
  return options.force ? load() : cachedConfig("metricsLedger", load);
}

/** The tab-strip warning state, from the same cached summary — no extra read. */
export async function getLedgerPillState(): Promise<{ warn: boolean; count: number }> {
  try {
    const summary = await getLedgerSummary();
    return summary.pill;
  } catch {
    // A ledger that cannot be read must not break the settings shell; a pill
    // that silently stays dark is the lesser failure.
    return { warn: false, count: 0 };
  }
}

async function loadLedgerSummary(days: number): Promise<LedgerSummary> {
  const settings = await getSettings();
  const today = metricsSnapshotDate(new Date());
  const fromDay = shiftIsoDay(today, -(Math.max(1, days) - 1));

  const [rows, claims, installed] = await Promise.all([
    db
      .select()
      .from(metricsDay)
      .where(gte(metricsDay.day, fromDay))
      .orderBy(metricsDay.day),
    db
      .select({ day: metricsClaim.day, status: metricsClaim.status, claimedAt: metricsClaim.claimedAt })
      .from(metricsClaim)
      .where(eq(metricsClaim.kind, "snapshot"))
      .orderBy(desc(metricsClaim.day))
      .limit(8),
    statementsInstalled(),
  ]);

  const latestDay = rows.length > 0 ? String(rows[rows.length - 1].day) : null;
  const dayRows = groupByDay(rows);
  const calibration = settings.metricsEgressCalibration;

  const ledgerDays = [...dayRows.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, metrics]) => toLedgerDayRow(day, metrics, calibration));

  const budgets = buildBudgets({
    rows,
    today,
    calibration,
    caps: {
      computeHours: settings.metricsNeonCapComputeHours,
      egressBytes: settings.metricsNeonCapEgressBytes,
      storageBytes: settings.metricsNeonCapStorageBytes,
    },
    latestStorageBytes: latestDay
      ? (dayRows.get(latestDay)?.get(METRICS.storageDbBytes)?.get("")?.value ?? null)
      : null,
  });

  const statuses: ThresholdStatus[] = budgets.map((budget) => budget.status);
  const latest = ledgerDays[ledgerDays.length - 1];
  statuses.push(statusForErrorRate(latest?.errors ?? 0, latest?.requests ?? 0));
  if (latest) {
    statuses.push(
      statusForMetric(METRICS.dbCacheHitRatio, latest.cacheHitRatio),
      statusForMetric(METRICS.dbConnectionsPeak, latest.connectionsPeak),
      statusForMetric(METRICS.dbIdleInTxSecondsMax, null),
    );
  }
  const worst = worstStatus(...statuses);

  return {
    latestDay,
    today,
    generatedAt: Date.now(),
    status: worst,
    budgets,
    days: ledgerDays,
    details: buildDetails(dayRows, calibration),
    sources: buildSources({ installed, claims, latestDay, today, enabled: settings.metricsEnabled }),
    pill: {
      warn: shouldWarnOnPill(statuses),
      count: statuses.filter((status) => status === "watch" || status === "critical").length,
    },
    enabled: settings.metricsEnabled,
    snapshotTime: settings.metricsSnapshotTime,
    retentionDays: settings.metricsRetentionDays,
    calibration,
  };
}

/** One day's rows, keyed by `metric` then `label_key`. */
type DayMetrics = Map<string, Map<string, DayRecord>>;

function groupByDay(rows: DayRecord[]): Map<string, DayMetrics> {
  const byDay = new Map<string, DayMetrics>();
  for (const row of rows) {
    const day = String(row.day);
    let metrics = byDay.get(day);
    if (!metrics) {
      metrics = new Map();
      byDay.set(day, metrics);
    }
    let labelled = metrics.get(row.metric);
    if (!labelled) {
      labelled = new Map();
      metrics.set(row.metric, labelled);
    }
    labelled.set(row.labelKey, row);
  }
  return byDay;
}

/** Sum a metric across every label of one day. */
function sumMetric(metrics: DayMetrics, metric: string): number | null {
  const labelled = metrics.get(metric);
  if (!labelled || labelled.size === 0) {
    return null;
  }
  let total = 0;
  for (const row of labelled.values()) {
    total += row.value;
  }
  return total;
}

/** Read the single unlabelled value of a metric. */
function singleMetric(metrics: DayMetrics, metric: string): number | null {
  return metrics.get(metric)?.get("")?.value ?? null;
}

function toLedgerDayRow(day: string, metrics: DayMetrics, calibration: number): LedgerDayRow {
  const egress = sumMetric(metrics, METRICS.appEgressBytes);
  const routes = metrics.get(METRICS.appEgressBytes);
  let topRoute: LedgerDayRow["topRoute"] = null;
  if (routes) {
    for (const [labelKey, row] of routes) {
      if (!topRoute || row.value > topRoute.bytes) {
        topRoute = { route: parseLabelKey(labelKey).route ?? labelKey, bytes: row.value };
      }
    }
  }
  return {
    day,
    storageBytes: singleMetric(metrics, METRICS.storageDbBytes),
    activeMinutes: singleMetric(metrics, METRICS.computeActiveMinutes),
    wakeups: singleMetric(metrics, METRICS.computeEndpointWakeups),
    egressBytes: egress === null ? null : calibrateBytes(egress, calibration),
    requests: sumMetric(metrics, METRICS.appRequests),
    errors: sumMetric(metrics, METRICS.appErrors),
    cacheHitRatio: singleMetric(metrics, METRICS.dbCacheHitRatio),
    connectionsPeak: singleMetric(metrics, METRICS.dbConnectionsPeak),
    topRoute,
  };
}

interface BuildBudgetsInput {
  rows: DayRecord[];
  today: string;
  calibration: number;
  caps: { computeHours: number; egressBytes: number; storageBytes: number };
  latestStorageBytes: number | null;
}

/**
 * The three budget bars. Storage is a level measured now; compute and egress
 * accumulate across the month and are projected, because the question the page
 * answers is "will we still fit by the 30th", not "how much did we use today".
 */
function buildBudgets(input: BuildBudgetsInput): BudgetBar[] {
  const month = monthOfDay(input.today);
  const monthDays = daysInMonth(month);
  const dayOfMonthNow = dayOfMonth(input.today);

  const computeMinutesByDay = new Map<string, number>();
  const egressByDay = new Map<string, number>();
  for (const row of input.rows) {
    const day = String(row.day);
    if (!day.startsWith(month)) {
      continue;
    }
    if (row.metric === METRICS.computeActiveMinutes) {
      computeMinutesByDay.set(day, (computeMinutesByDay.get(day) ?? 0) + row.value);
    } else if (row.metric === METRICS.appEgressBytes) {
      egressByDay.set(day, (egressByDay.get(day) ?? 0) + row.value);
    }
  }

  const computeMinutes = [...computeMinutesByDay.values()].reduce((sum, value) => sum + value, 0);
  const computeHours = computeMinutes / 60;
  const egressRaw = [...egressByDay.values()].reduce((sum, value) => sum + value, 0);
  const egress = calibrateBytes(egressRaw, input.calibration);

  const storageFraction =
    input.caps.storageBytes > 0 && input.latestStorageBytes !== null
      ? input.latestStorageBytes / input.caps.storageBytes
      : null;

  const computeProjection = projectToCap({
    monthToDate: computeHours,
    daysCounted: computeMinutesByDay.size,
    dayOfMonth: dayOfMonthNow,
    daysInMonth: monthDays,
    cap: input.caps.computeHours,
  });
  const egressProjection = projectToCap({
    monthToDate: egress,
    daysCounted: egressByDay.size,
    dayOfMonth: dayOfMonthNow,
    daysInMonth: monthDays,
    cap: input.caps.egressBytes,
  });

  return [
    {
      key: "storage",
      label: "Storage",
      basis: "current database size",
      used: input.latestStorageBytes ?? 0,
      cap: input.caps.storageBytes,
      unit: "bytes",
      projection: null,
      status: statusForFraction(storageFraction),
      estimated: false,
      note:
        input.latestStorageBytes === null
          ? "No snapshot yet — the first one runs at the configured time."
          : "Measured with pg_database_size; exact on any plan.",
    },
    {
      key: "compute",
      label: "Compute",
      basis: "active hours this month",
      used: computeHours,
      cap: input.caps.computeHours,
      unit: "hours",
      projection: computeProjection,
      status: computeProjection.insufficientData
        ? "unknown"
        : statusForFraction(computeProjection.usedFraction),
      estimated: true,
      note: computeProjection.insufficientData
        ? "Too few closed days to project honestly yet."
        : "Derived from the minutes the app touched the database — Neon's own figure needs a paid plan.",
    },
    {
      key: "egress",
      label: "Egress",
      basis: "bytes read from Postgres this month",
      used: egress,
      cap: input.caps.egressBytes,
      unit: "bytes",
      projection: egressProjection,
      status: egressProjection.insufficientData
        ? "unknown"
        : statusForFraction(egressProjection.usedFraction),
      estimated: true,
      note:
        input.calibration === 1
          ? "Uncalibrated estimate — set the ratio from Neon Console → Billing → Usage to anchor it."
          : `Estimate scaled by the calibration ratio (${input.calibration.toFixed(2)}×).`,
    },
  ];
}

/** How many recent days carry drill-down detail in the page payload. */
const DETAIL_DAYS = 7;

/** Detail for the newest closed days, newest first. */
function buildDetails(byDay: Map<string, DayMetrics>, calibration: number): DayDetail[] {
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .slice(0, DETAIL_DAYS)
    .map(([day, metrics]) => buildDetail(day, metrics, calibration));
}

function buildDetail(day: string, metrics: DayMetrics, calibration: number): DayDetail {
  const routes: DayDetail["topRoutes"] = [];
  const egressRows = metrics.get(METRICS.appEgressBytes) ?? new Map();
  const requestRows = metrics.get(METRICS.appRequests) ?? new Map();
  for (const [labelKey, row] of egressRows) {
    const route = parseLabelKey(labelKey).route ?? labelKey;
    routes.push({
      route,
      bytes: calibrateBytes(row.value, calibration),
      requests: requestRows.get(labelKey)?.value ?? 0,
    });
  }
  routes.sort((a, b) => b.bytes - a.bytes);

  const cacheReads = [...(metrics.get(METRICS.appCacheRead) ?? new Map()).entries()].map(
    ([labelKey, row]) => ({ result: parseLabelKey(labelKey).result ?? labelKey, count: row.value }),
  );
  const dispatchFailures = [
    ...(metrics.get(METRICS.appDispatchFailure) ?? new Map()).entries(),
  ].map(([labelKey, row]) => ({
    kind: parseLabelKey(labelKey).kind ?? labelKey,
    count: row.value,
  }));

  const baseline = metrics.get(METRICS.dbStatsResetEpoch)?.get("");
  const baselineDetail = (baseline?.detail ?? {}) as { gapDays?: number; reset?: boolean };

  return {
    day,
    topQueries: metrics.get(METRICS.dbQueryTop)?.get("")?.detail ?? null,
    topRoutes: routes,
    cacheReads,
    dispatchFailures,
    gapDays: baselineDetail.gapDays ?? 0,
    statsReset: baselineDetail.reset === true,
  };
}

interface BuildSourcesInput {
  installed: boolean;
  claims: { day: string; status: string; claimedAt: Date }[];
  latestDay: string | null;
  today: string;
  enabled: boolean;
}

/**
 * Per-source honesty: what is reporting, what is not, and the exact thing that
 * would fix it. A panel that silently shows nothing is how a monitoring page
 * loses its reader.
 */
function buildSources(input: BuildSourcesInput): SourceStatus[] {
  const latestClaim = input.claims[0];
  const closedToday = input.claims.some(
    (claim) => claim.day === input.today && claim.status === "done",
  );

  const sources: SourceStatus[] = [
    {
      key: "postgres",
      label: "Postgres catalog",
      state: "ok",
      detail: "pg_database_size, pg_stat_database, pg_stat_activity — exact on any plan.",
    },
    {
      key: "statements",
      label: "pg_stat_statements",
      state: input.installed ? "ok" : "not-installed",
      detail: input.installed
        ? "Installed — per-query attribution is available in the day detail."
        : "Not installed. Run CREATE EXTENSION IF NOT EXISTS pg_stat_statements; to see which queries drive the load.",
    },
    {
      key: "snapshot",
      label: "Daily snapshot",
      state: !input.enabled ? "unavailable" : closedToday ? "ok" : "pending",
      detail: !input.enabled
        ? "Collection is switched off in Settings."
        : latestClaim
          ? `Last run ${String(latestClaim.day)} (${latestClaim.status}).${closedToday ? "" : " Today is not closed yet."}`
          : "No snapshot has run yet — the first fires at the configured time.",
    },
    {
      key: "neon",
      label: "Neon usage API",
      state: "unavailable",
      detail:
        "Paid-plan only (403 on this plan). Compute and egress are therefore estimates; the authoritative figures are in Neon Console → Billing → Usage.",
    },
    {
      key: "browser",
      label: "Browser telemetry",
      state: "unavailable",
      detail: "Not collected by design — nothing about resource usage ships to users' browsers.",
    },
  ];
  return sources;
}

/** Shift a `YYYY-MM-DD` date by whole days. */
function shiftIsoDay(day: string, delta: number): string {
  const base = new Date(`${day}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + delta);
  return base.toISOString().slice(0, 10);
}

/** The metric catalogue, for the page's captions and pickers. */
export function listMetricOptions(): MetricOption[] {
  return METRIC_DEFS.map((def) => ({
    name: def.name,
    label: def.label,
    unit: def.unit,
    source: def.source,
    description: def.description,
  }));
}
