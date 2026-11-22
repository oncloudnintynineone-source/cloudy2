import { describe, expect, it } from "vitest";

import { pickerChipRemovable, pickerTriggerLabel } from "./picker";

describe("pickerTriggerLabel", () => {
  it("invites adding while nothing is picked", () => {
    expect(pickerTriggerLabel(0)).toBe("Add");
  });

  it("says the dialog edits once something is picked (the trigger adds AND removes)", () => {
    expect(pickerTriggerLabel(1)).toBe("Edit");
    expect(pickerTriggerLabel(12)).toBe("Edit");
  });

  it("honors caller wording overrides", () => {
    expect(pickerTriggerLabel(0, { addLabel: "Choose people" })).toBe("Choose people");
    expect(pickerTriggerLabel(2, { editLabel: "Change people" })).toBe("Change people");
  });
});

describe("pickerChipRemovable", () => {
  it("is false for an empty/overflow entry", () => {
    expect(pickerChipRemovable(0)).toBe(false);
  });

  it("is true for a real chip", () => {
    expect(pickerChipRemovable(1)).toBe(true);
  });
});
