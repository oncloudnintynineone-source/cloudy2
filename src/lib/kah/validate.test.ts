import { describe, expect, it } from "vitest";

import {
  normalizeKahGroupName,
  normalizeKahPercentage,
  validateKahGroupForm,
  validateKahNotificationsForm,
} from "./validate";

describe("normalizeKahGroupName", () => {
  it("trims and keeps a usable name", () => {
    expect(normalizeKahGroupName("  Command Group  ")).toBe("Command Group");
  });

  it("rejects empty and oversized names", () => {
    expect(normalizeKahGroupName("   ")).toBeNull();
    expect(normalizeKahGroupName("x".repeat(81))).toBeNull();
    expect(normalizeKahGroupName("x".repeat(80))).toBe("x".repeat(80));
  });
});

describe("normalizeKahPercentage", () => {
  it("rounds and clamps to 1–100", () => {
    expect(normalizeKahPercentage(50.4)).toBe(50);
    expect(normalizeKahPercentage(0)).toBe(1);
    expect(normalizeKahPercentage(150)).toBe(100);
  });

  it("falls back to the max on non-finite input", () => {
    expect(normalizeKahPercentage(undefined)).toBe(100);
    expect(normalizeKahPercentage(Number.NaN)).toBe(100);
  });
});

describe("validateKahGroupForm", () => {
  const valid = { name: "Command", minPercentage: 60 };

  it("accepts a valid form", () => {
    expect(validateKahGroupForm(valid)).toEqual({});
  });

  it("reports name and percentage problems", () => {
    expect(validateKahGroupForm({ ...valid, name: "  " }).name).toBeTruthy();
    expect(
      validateKahGroupForm({ ...valid, name: "x".repeat(81) }).name,
    ).toBeTruthy();
    expect(validateKahGroupForm({ ...valid, minPercentage: 0 }).minPercentage).toBeTruthy();
    expect(validateKahGroupForm({ ...valid, minPercentage: 101 }).minPercentage).toBeTruthy();
    expect(
      validateKahGroupForm({ ...valid, minPercentage: Number.NaN }).minPercentage,
    ).toBeTruthy();
  });
});

describe("validateKahNotificationsForm", () => {
  const valid = {
    subjectTemplate: "[cloudy2] KAH limit exceeded — {event}",
    bodyTemplate: "Breaches:\n{breaches}",
  };

  it("accepts a valid form", () => {
    expect(validateKahNotificationsForm(valid)).toEqual({});
  });

  it("requires the subject/body templates and the breaches token", () => {
    expect(validateKahNotificationsForm({ ...valid, subjectTemplate: "  " }).subjectTemplate).toBeTruthy();
    expect(
      validateKahNotificationsForm({ ...valid, subjectTemplate: "x".repeat(201) }).subjectTemplate,
    ).toBeTruthy();
    expect(validateKahNotificationsForm({ ...valid, bodyTemplate: "" }).bodyTemplate).toBeTruthy();
    expect(
      validateKahNotificationsForm({
        ...valid,
        bodyTemplate: "no tokens here",
      }).bodyTemplate,
    ).toContain("{breaches}");
    expect(
      validateKahNotificationsForm({
        ...valid,
        bodyTemplate: `{"breaches": "json-ish"} ${"x".repeat(5001)}`,
      }).bodyTemplate,
    ).toBeTruthy(); // over max length
  });
});
