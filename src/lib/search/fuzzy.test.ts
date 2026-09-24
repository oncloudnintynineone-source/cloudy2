import { describe, expect, it } from "vitest";

import { fuzzyFilter, fuzzyMatches, fuzzySearch } from "./fuzzy";

const PEOPLE = [
  { id: "a", name: "Alice Tan", shortname: "AT", phone: "81234567" },
  { id: "b", name: "Bob Lim", shortname: "BL", phone: "82345678" },
  { id: "c", name: "Cara Ng", shortname: null, phone: "83456789" },
];

const personFields = (p: (typeof PEOPLE)[number]) => [
  p.name,
  p.shortname,
  { value: p.phone, fuzzy: false },
];

describe("fuzzyFilter", () => {
  it("returns a shallow copy for a blank query", () => {
    const result = fuzzyFilter(PEOPLE, "  ", personFields);
    expect(result).toEqual(PEOPLE);
    expect(result).not.toBe(PEOPLE);
  });

  it("tolerates a typo in a name", () => {
    expect(fuzzyFilter(PEOPLE, "alise", personFields).map((p) => p.id)).toEqual(["a"]);
  });

  it("requires every query word to match (AND)", () => {
    expect(fuzzyFilter(PEOPLE, "alice tan", personFields).map((p) => p.id)).toEqual(["a"]);
    expect(fuzzyFilter(PEOPLE, "alice wong", personFields)).toEqual([]);
  });

  it("preserves the input order of matches", () => {
    expect(fuzzyFilter(PEOPLE, "8", personFields).map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("matches a substring field exactly, never fuzzily", () => {
    expect(fuzzyFilter(PEOPLE, "83456789", personFields).map((p) => p.id)).toEqual(["c"]);
    // A near-miss number must not cross-match a similar one.
    expect(fuzzyFilter(PEOPLE, "83456789", personFields).map((p) => p.id)).not.toContain("b");
  });

  it("matches short names/initials", () => {
    expect(fuzzyFilter(PEOPLE, "at", personFields).map((p) => p.id)).toEqual(["a"]);
    expect(fuzzyFilter(PEOPLE, "bl", personFields).map((p) => p.id)).toEqual(["b"]);
  });

  it("returns nothing when there is no match", () => {
    expect(fuzzyFilter(PEOPLE, "zzz", personFields)).toEqual([]);
  });

  it("does not drag in a different short word", () => {
    expect(fuzzyFilter(PEOPLE, "ling", (p) => [p.name])).toEqual([]);
  });
});

describe("fuzzyMatches", () => {
  it("treats a blank query as matching everything", () => {
    expect(fuzzyMatches(["Alice"], "")).toBe(true);
    expect(fuzzyMatches(["Alice"], "   ")).toBe(true);
  });

  it("matches fuzzily and with exact substring fields", () => {
    expect(fuzzyMatches(["Alice Tan"], "alise")).toBe(true);
    expect(fuzzyMatches([{ value: "81234567", fuzzy: false }], "3456")).toBe(true);
    expect(fuzzyMatches([{ value: "81234567", fuzzy: false }], "9999")).toBe(false);
  });
});

describe("fuzzySearch", () => {
  it("returns a shallow copy for a blank query", () => {
    const items = [{ title: "Report" }];
    const result = fuzzySearch(items, "", ["title"]);
    expect(result).toEqual(items);
    expect(result).not.toBe(items);
  });

  it("returns matches in relevance order", () => {
    const items = [{ title: "Quarterly report" }, { title: "Report" }, { title: "Meeting" }];
    const result = fuzzySearch(items, "report", ["title"]);
    expect(result.map((item) => item.title)).toEqual(["Report", "Quarterly report"]);
  });

  it("matches a typo across multiple keys", () => {
    const items = [
      { title: "Safety briefing", location: "HQ" },
      { title: "Other", location: "Sembawang" },
    ];
    const result = fuzzySearch(items, "sembawng", ["title", "location"]);
    expect(result.map((item) => item.title)).toEqual(["Other"]);
  });
});
