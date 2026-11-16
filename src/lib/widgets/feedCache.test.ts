import { describe, expect, it } from "vitest";

import { feedCacheIsFresh, WIDGET_FEED_CACHE_TTL_MS } from "./feedCache";

describe("feedCacheIsFresh", () => {
  const now = 1_000_000_000;

  it("is fresh within the TTL with a matching epoch", () => {
    expect(feedCacheIsFresh(new Date(now - 60_000), 7, 7, now)).toBe(true);
  });

  it("is stale after the TTL", () => {
    expect(feedCacheIsFresh(new Date(now - WIDGET_FEED_CACHE_TTL_MS - 1), 7, 7, now)).toBe(false);
  });

  it("is stale when the events-cache epoch changed", () => {
    expect(feedCacheIsFresh(new Date(now - 60_000), 7, 8, now)).toBe(false);
  });
});
