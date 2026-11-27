import { describe, expect, it } from "vitest";

import { dashboardBootSignature, prefetchTargetForPeriod } from "./prefetch";

describe("prefetchTargetForPeriod", () => {
  it("steps a month anchor by whole months", () => {
    expect(
      prefetchTargetForPeriod({ kind: "month", month: "2026-01", date: "2026-01-15" }, 1),
    ).toEqual({ month: "2026-02", date: null });
    expect(
      prefetchTargetForPeriod({ kind: "month", month: "2026-01", date: "2026-01-15" }, -1),
    ).toEqual({ month: "2025-12", date: null });
  });

  it("steps week and day kinds by their own unit", () => {
    expect(
      prefetchTargetForPeriod({ kind: "week", month: "2026-01", date: "2026-01-28" }, 1),
    ).toEqual({ month: "2026-02", date: "2026-02-04" });
    expect(
      prefetchTargetForPeriod({ kind: "schedule", month: "2026-01", date: "2026-01-31" }, 1),
    ).toEqual({ month: "2026-02", date: "2026-02-01" });
    expect(
      prefetchTargetForPeriod({ kind: "agenda", month: "2026-01", date: "2026-01-01" }, -1),
    ).toEqual({ month: "2025-12", date: "2025-12-31" });
  });
});

describe("dashboardBootSignature", () => {
  it("is order-stable and distinguishes each data-bearing param", () => {
    const base = { view: "v1", month: "2026-01", date: null, refresh: null };
    expect(dashboardBootSignature(base)).toBe(dashboardBootSignature({ ...base }));
    expect(dashboardBootSignature(base)).not.toBe(
      dashboardBootSignature({ ...base, month: "2026-02" }),
    );
  });
});
