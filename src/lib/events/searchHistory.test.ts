import { describe, expect, it } from "vitest";

import {
  addSearchHistoryEntry,
  cleanSearchHistoryList,
  removeSearchHistoryEntry,
  SEARCH_HISTORY_MAX,
} from "./searchHistory";

describe("cleanSearchHistoryList", () => {
  it("returns [] for non-arrays", () => {
    expect(cleanSearchHistoryList(null)).toEqual([]);
    expect(cleanSearchHistoryList(undefined)).toEqual([]);
    expect(cleanSearchHistoryList("not an array")).toEqual([]);
    expect(cleanSearchHistoryList({ 0: "x" })).toEqual([]);
  });

  it("drops non-strings, empties and whitespace, and trims", () => {
    expect(cleanSearchHistoryList([1, "", "  ", " foo ", null, "bar"])).toEqual([
      "foo",
      "bar",
    ]);
  });

  it("dedupes case-insensitively, keeping the first occurrence", () => {
    expect(cleanSearchHistoryList(["Foo", "foo", "FOO", "bar", "Bar"])).toEqual([
      "Foo",
      "bar",
    ]);
  });
});

describe("addSearchHistoryEntry", () => {
  it("prepends the new query", () => {
    expect(addSearchHistoryEntry(["foo", "bar"], "baz")).toEqual(["baz", "foo", "bar"]);
  });

  it("moves a duplicate to the front and trims", () => {
    expect(addSearchHistoryEntry(["foo", "bar"], "  FOO  ")).toEqual(["FOO", "bar"]);
  });

  it("ignores an empty/whitespace query", () => {
    expect(addSearchHistoryEntry(["foo"], "   ")).toEqual(["foo"]);
  });

  it("caps the list at SEARCH_HISTORY_MAX", () => {
    const base = Array.from({ length: SEARCH_HISTORY_MAX }, (_, i) => `q${i}`);
    const out = addSearchHistoryEntry(base, "newest");
    expect(out).toHaveLength(SEARCH_HISTORY_MAX);
    expect(out[0]).toBe("newest");
    expect(out).not.toContain(`q${SEARCH_HISTORY_MAX - 1}`);
  });
});

describe("removeSearchHistoryEntry", () => {
  it("removes the query case-insensitively", () => {
    expect(removeSearchHistoryEntry(["Foo", "bar", "FOO"], "foo")).toEqual(["bar"]);
  });

  it("keeps the list when the query is absent or empty", () => {
    expect(removeSearchHistoryEntry(["foo", "bar"], "baz")).toEqual(["foo", "bar"]);
    expect(removeSearchHistoryEntry(["foo"], "  ")).toEqual(["foo"]);
  });
});
