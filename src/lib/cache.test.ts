import { describe, expect, it } from "vitest";

import { getCachedValue, invalidateCachedValue } from "./cache";
import { CONFIG_CACHE_KEYS, invalidateConfigCache } from "./configCache";

describe("getCachedValue", () => {
  it("serves the cached value within the TTL", async () => {
    let loads = 0;
    const loader = async () => {
      loads += 1;
      return loads;
    };
    const key = "test:cache-hit";
    expect(await getCachedValue(key, 60_000, loader)).toBe(1);
    expect(await getCachedValue(key, 60_000, loader)).toBe(1);
    expect(loads).toBe(1);
  });

  it("reloads after invalidateCachedValue", async () => {
    let loads = 0;
    const loader = async () => {
      loads += 1;
      return loads;
    };
    const key = "test:invalidate";
    await getCachedValue(key, 60_000, loader);
    invalidateCachedValue(key);
    expect(await getCachedValue(key, 60_000, loader)).toBe(2);
    expect(loads).toBe(2);
  });
});

describe("invalidateConfigCache", () => {
  it("clears the named config keys so the next read reloads", async () => {
    let loads = 0;
    const loader = async () => {
      loads += 1;
      return loads;
    };
    await getCachedValue(CONFIG_CACHE_KEYS.calendars, 60_000, loader);
    await getCachedValue(CONFIG_CACHE_KEYS.calendars, 60_000, loader);
    expect(loads).toBe(1);

    invalidateConfigCache(["calendars"]);
    await getCachedValue(CONFIG_CACHE_KEYS.calendars, 60_000, loader);
    expect(loads).toBe(2);
  });

  it("leaves unnamed keys cached", async () => {
    let loads = 0;
    const loader = async () => {
      loads += 1;
      return loads;
    };
    await getCachedValue(CONFIG_CACHE_KEYS.users, 60_000, loader);

    invalidateConfigCache(["calendars"]);
    await getCachedValue(CONFIG_CACHE_KEYS.users, 60_000, loader);
    expect(loads).toBe(1);
  });
});
