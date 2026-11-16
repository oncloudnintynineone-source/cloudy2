import { describe, expect, it } from "vitest";

import { consumeRateLimit, pruneRateLimitBuckets, type RateLimitBucket } from "./rateLimit";

describe("consumeRateLimit", () => {
  it("allows up to the limit then denies with a retry hint", () => {
    const buckets = new Map<string, RateLimitBucket>();
    const now = 1_000_000;
    expect(consumeRateLimit(buckets, "t", now, 3, 60_000).allowed).toBe(true);
    expect(consumeRateLimit(buckets, "t", now + 1, 3, 60_000).allowed).toBe(true);
    expect(consumeRateLimit(buckets, "t", now + 2, 3, 60_000).allowed).toBe(true);
    const denied = consumeRateLimit(buckets, "t", now + 3, 3, 60_000);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSec).toBe(60);
  });

  it("starts a fresh window after the window elapses", () => {
    const buckets = new Map<string, RateLimitBucket>();
    const now = 1_000_000;
    for (let i = 0; i < 2; i += 1) {
      expect(consumeRateLimit(buckets, "t", now, 2, 60_000).allowed).toBe(true);
    }
    expect(consumeRateLimit(buckets, "t", now, 2, 60_000).allowed).toBe(false);
    expect(consumeRateLimit(buckets, "t", now + 60_000, 2, 60_000).allowed).toBe(true);
  });

  it("tracks keys independently and survives a backwards clock", () => {
    const buckets = new Map<string, RateLimitBucket>();
    expect(consumeRateLimit(buckets, "a", 100, 1, 60_000).allowed).toBe(true);
    expect(consumeRateLimit(buckets, "b", 100, 1, 60_000).allowed).toBe(true);
    expect(consumeRateLimit(buckets, "a", 100, 1, 60_000).allowed).toBe(false);
    // Clock moved back past the window start: treat as a fresh window.
    expect(consumeRateLimit(buckets, "a", 50, 1, 60_000).allowed).toBe(true);
  });
});

describe("pruneRateLimitBuckets", () => {
  it("drops expired buckets once the map is large", () => {
    const buckets = new Map<string, RateLimitBucket>();
    for (let i = 0; i < 1_000; i += 1) {
      buckets.set(`k${i}`, { windowStart: 0, count: 1 });
    }
    buckets.set("fresh", { windowStart: 100_000, count: 1 });
    pruneRateLimitBuckets(buckets, 100_000, 60_000);
    expect(buckets.size).toBe(1);
    expect(buckets.has("fresh")).toBe(true);
  });

  it("does nothing for a small map", () => {
    const buckets = new Map<string, RateLimitBucket>([
      ["old", { windowStart: 0, count: 1 }],
    ]);
    pruneRateLimitBuckets(buckets, 100_000, 60_000);
    expect(buckets.size).toBe(1);
  });
});
