/**
 * Unit tests for the running-counter writer (src/lib/metrics/running.ts).
 *
 * The database is mocked at the module boundary — the flush chain is
 * `db.insert().values().onConflictDoUpdate()` — so the mock records the rows
 * each flush would write and lets a test fail or hold the merge open on
 * demand. No live DB, matching the repo's unit-test rule.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = { fail: null as Error | null, hold: null as Promise<void> | null };
  const onConflictDoUpdate = vi.fn(() =>
    state.hold ? state.hold : state.fail ? Promise.reject(state.fail) : Promise.resolve(),
  );
  const values = vi.fn((_rows: unknown[]) => ({ onConflictDoUpdate }));
  const insert = vi.fn(() => ({ values }));
  return { state, insert, values, onConflictDoUpdate };
});

vi.mock("@/db", () => ({ db: { insert: mocks.insert } }));

import { METRICS_RUNNING_BUFFER_MAX, METRICS_RUNNING_FLUSH_MS } from "./config";
import { METRICS } from "./metrics";
import { metricsSnapshotDate } from "./schedule";
import {
  flushRunningCounters,
  maybeFlushRunningCounters,
  recordRouteResponse,
  resetRunningCountersForTests,
} from "./running";

interface FlushRow {
  day: string;
  metric: string;
  labelKey: string;
  value: number;
}

/** The rows handed to the insert on the most recent flush, if any. */
function flushedRows(): FlushRow[] {
  const calls = mocks.values.mock.calls;
  return calls.length === 0 ? [] : (calls[calls.length - 1][0] as FlushRow[]);
}

beforeEach(() => {
  resetRunningCountersForTests();
  mocks.state.fail = null;
  mocks.state.hold = null;
  mocks.insert.mockClear();
  mocks.values.mockClear();
  mocks.onConflictDoUpdate.mockClear();
  // The failed-flush path logs; keep the suite output clean.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("recordRouteResponse + flushRunningCounters", () => {
  it("accumulates counts per route and flushes them as one row set", async () => {
    recordRouteResponse("/api/test", 100, true);
    recordRouteResponse("/api/test", 250, true);
    await flushRunningCounters();

    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(flushedRows()).toEqual([
      {
        day: metricsSnapshotDate(new Date()),
        metric: METRICS.appRequests,
        labelKey: "route=/api/test",
        value: 2,
      },
      {
        day: metricsSnapshotDate(new Date()),
        metric: METRICS.appEgressBytes,
        labelKey: "route=/api/test",
        value: 350,
      },
    ]);
  });

  it("counts errors and omits zero-valued metric rows", async () => {
    recordRouteResponse("/api/test", 0, false);
    await flushRunningCounters();

    const rows = flushedRows();
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.metric)).toEqual([METRICS.appRequests, METRICS.appErrors]);
    expect(rows.every((row) => row.value > 0)).toBe(true);
  });

  it("drains the buffer: a second flush with no new counts writes nothing", async () => {
    recordRouteResponse("/api/test", 10, true);
    await flushRunningCounters();
    await flushRunningCounters();

    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });

  it("re-adds drained counts after a failed flush, keeping concurrent writes", async () => {
    mocks.state.fail = new Error("db down");
    recordRouteResponse("/api/test", 100, true);
    await flushRunningCounters(); // swallowed by design
    expect(mocks.insert).toHaveBeenCalledTimes(1);

    // A request that lands while the merge is failing must survive too.
    mocks.state.fail = null;
    recordRouteResponse("/api/test", 50, true);
    await flushRunningCounters();

    expect(mocks.insert).toHaveBeenCalledTimes(2);
    expect(flushedRows()).toEqual([
      {
        day: metricsSnapshotDate(new Date()),
        metric: METRICS.appRequests,
        labelKey: "route=/api/test",
        value: 2,
      },
      {
        day: metricsSnapshotDate(new Date()),
        metric: METRICS.appEgressBytes,
        labelKey: "route=/api/test",
        value: 150,
      },
    ]);
  });
});

describe("maybeFlushRunningCounters", () => {
  const t0 = new Date("2026-11-28T10:00:00+08:00").getTime();

  it("does nothing while the buffer is empty", async () => {
    await maybeFlushRunningCounters(new Date(t0));
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("throttles to one flush per interval", async () => {
    recordRouteResponse("/api/test", 10, true);
    await maybeFlushRunningCounters(new Date(t0)); // first pass is due
    expect(mocks.insert).toHaveBeenCalledTimes(1);

    recordRouteResponse("/api/test", 10, true);
    await maybeFlushRunningCounters(new Date(t0 + METRICS_RUNNING_FLUSH_MS - 1000));
    expect(mocks.insert).toHaveBeenCalledTimes(1); // still throttled

    await maybeFlushRunningCounters(new Date(t0 + METRICS_RUNNING_FLUSH_MS + 1));
    expect(mocks.insert).toHaveBeenCalledTimes(2);
  });

  it("bypasses the throttle when the buffer outgrows its memory guard", async () => {
    for (let i = 0; i < METRICS_RUNNING_BUFFER_MAX; i++) {
      recordRouteResponse(`/api/route-${i}`, 0, true);
    }
    await maybeFlushRunningCounters(new Date(t0)); // interval irrelevant at the guard
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(flushedRows()).toHaveLength(METRICS_RUNNING_BUFFER_MAX); // requests only
  });

  it("shares the in-flight flush when the buffer refills mid-merge", async () => {
    let release: () => void = () => {};
    mocks.state.hold = new Promise<void>((resolve) => {
      release = resolve;
    });

    recordRouteResponse("/api/test", 10, true);
    const first = maybeFlushRunningCounters(new Date(t0));
    // Refill past the memory guard while the merge is in flight: due, but the
    // in-flight flush is shared instead of starting a second merge.
    for (let i = 0; i < METRICS_RUNNING_BUFFER_MAX; i++) {
      recordRouteResponse(`/api/route-${i}`, 0, true);
    }
    const second = maybeFlushRunningCounters(new Date(t0 + 1));
    expect(second).toBe(first);
    expect(mocks.insert).toHaveBeenCalledTimes(1);

    release();
    mocks.state.hold = null;
    await Promise.all([first, second]);

    // The carried counts go out on the next flush.
    await flushRunningCounters();
    expect(mocks.insert).toHaveBeenCalledTimes(2);
    expect(flushedRows()).toHaveLength(METRICS_RUNNING_BUFFER_MAX);
  });
});
