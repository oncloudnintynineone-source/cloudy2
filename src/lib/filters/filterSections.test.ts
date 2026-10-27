import { describe, expect, it } from "vitest";

import { applySectionSelection, sectionSelectionState } from "./filterSections";

const SECTION = [{ value: "a" }, { value: "b" }, { value: "c" }];

describe("sectionSelectionState", () => {
  it("reports none when nothing in the section is selected", () => {
    expect(sectionSelectionState(SECTION, [])).toBe("none");
    expect(sectionSelectionState(SECTION, ["other"])).toBe("none");
  });

  it("reports some for a partial selection", () => {
    expect(sectionSelectionState(SECTION, ["a"])).toBe("some");
    expect(sectionSelectionState(SECTION, ["a", "c"])).toBe("some");
  });

  it("reports all for a full selection, ignoring unknown ids", () => {
    expect(sectionSelectionState(SECTION, ["a", "b", "c"])).toBe("all");
    expect(sectionSelectionState(SECTION, ["a", "b", "c", "other"])).toBe("all");
  });

  it("treats an empty section as all (its All control is disabled)", () => {
    expect(sectionSelectionState([], [])).toBe("all");
  });
});

describe("applySectionSelection", () => {
  it("selects every value in the section and keeps other sections intact", () => {
    expect(applySectionSelection(SECTION, ["other"], "all")).toEqual([
      "other",
      "a",
      "b",
      "c",
    ]);
  });

  it("removes only the section's values when clearing", () => {
    expect(applySectionSelection(SECTION, ["other", "a", "c"], "none")).toEqual(["other"]);
  });

  it("is idempotent when the section is already fully selected or clear", () => {
    expect(applySectionSelection(SECTION, ["a", "b", "c"], "all")).toEqual(["a", "b", "c"]);
    expect(applySectionSelection(SECTION, [], "none")).toEqual([]);
  });
});
