import { describe, expect, it } from "vitest";

import { LIVE_ROUTE_MAX_AGE_MS, needsLiveRefresh } from "./liveRefreshRules";

describe("needsLiveRefresh", () => {
  const now = 1_000_000_000;

  it("treats a non-finite stamp as fresh (never hammer the network)", () => {
    expect(needsLiveRefresh(Number.NaN, now)).toBe(false);
    expect(needsLiveRefresh(Number.POSITIVE_INFINITY, now)).toBe(false);
  });

  it("is fresh for a just-rendered payload", () => {
    expect(needsLiveRefresh(now, now)).toBe(false);
    expect(needsLiveRefresh(now - 500, now)).toBe(false);
  });

  it("is fresh exactly at the window (exclusive)", () => {
    expect(needsLiveRefresh(now - LIVE_ROUTE_MAX_AGE_MS, now)).toBe(false);
  });

  it("is stale past the window (a cache replay)", () => {
    expect(needsLiveRefresh(now - LIVE_ROUTE_MAX_AGE_MS - 1, now)).toBe(true);
    expect(needsLiveRefresh(now - 120_000, now)).toBe(true);
  });

  it("treats a future stamp (clock skew) as age 0", () => {
    expect(needsLiveRefresh(now + 60_000, now)).toBe(false);
  });

  it("honours a custom window", () => {
    expect(needsLiveRefresh(now - 1_000, now, 500)).toBe(true);
    expect(needsLiveRefresh(now - 1_000, now, 5_000)).toBe(false);
  });
});
