import { describe, expect, it } from "vitest";

import { normalizeStringArray } from "./arrays";

describe("normalizeStringArray", () => {
  it("returns null for a non-array value", () => {
    expect(normalizeStringArray(null)).toBeNull();
    expect(normalizeStringArray("x")).toBeNull();
    expect(normalizeStringArray({})).toBeNull();
  });

  it("preserves an explicit empty array", () => {
    expect(normalizeStringArray([])).toEqual([]);
  });

  it("drops non-strings and empty strings by default", () => {
    expect(normalizeStringArray(["a", "", 1, null, "b"])).toEqual(["a", "b"]);
  });

  it("keeps empty strings when asked", () => {
    expect(normalizeStringArray(["a", "", "b"], { keepEmpty: true })).toEqual(["a", "", "b"]);
  });
});
