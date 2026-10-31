import { describe, expect, it } from "vitest";

import { STEP_LABELS, STEP_SHORT_LABELS, buildSteps, type StepId } from "./eventFormSteps";

const ALL_STEP_IDS: StepId[] = [
  "type",
  "time",
  "location",
  "invitees",
  "remarks",
  "settings",
  "review",
];

describe("buildSteps", () => {
  it("walks every step when the type enables all optional sections", () => {
    expect(buildSteps(true, true, true).map((step) => step.id)).toEqual(ALL_STEP_IDS);
  });

  it("drops the optional sections the type hides, keeping settings and review", () => {
    expect(buildSteps(false, false, false).map((step) => step.id)).toEqual([
      "type",
      "time",
      "settings",
      "review",
    ]);
  });

  it("keeps the time fields gated and the other sections free to advance", () => {
    const steps = buildSteps(true, true, true);
    expect(steps.find((step) => step.id === "time")?.fields).toEqual([
      "start",
      "end",
      "startAmPm",
      "endAmPm",
    ]);
    expect(steps.find((step) => step.id === "location")?.fields).toEqual([]);
  });
});

describe("step labels", () => {
  it("names every step in both the full and compact maps", () => {
    for (const id of ALL_STEP_IDS) {
      expect(STEP_LABELS[id]).toBeTruthy();
      expect(STEP_SHORT_LABELS[id]).toBeTruthy();
    }
  });
});
