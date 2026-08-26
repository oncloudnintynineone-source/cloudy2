import { describe, expect, it } from "vitest";

import {
  KAH_NOTIFICATION_EMAILS_MAX,
  normalizeKahGroupName,
  normalizeKahNotificationEmails,
  normalizeKahPercentage,
  validateKahEmailsForm,
  validateKahGroupForm,
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

describe("normalizeKahNotificationEmails", () => {
  it("trims, drops empties and case-duplicates, preserves first spelling", () => {
    expect(
      normalizeKahNotificationEmails([" A@x.com ", "", "a@X.COM", "b@y.com"]),
    ).toEqual(["A@x.com", "b@y.com"]);
  });

  it("ignores non-strings and caps the list", () => {
    const many = Array.from({ length: 15 }, (_, i) => `u${i}@x.com`);
    expect(normalizeKahNotificationEmails(many)).toHaveLength(KAH_NOTIFICATION_EMAILS_MAX);
    expect(normalizeKahNotificationEmails([1, null])).toEqual([]);
    expect(normalizeKahNotificationEmails("not-an-array")).toEqual([]);
  });
});

describe("validateKahEmailsForm", () => {
  it("accepts valid address lists and an empty list", () => {
    expect(validateKahEmailsForm({ emails: ["ops@unit.gov", "b@y.com"] })).toEqual({});
    expect(validateKahEmailsForm({ emails: [] })).toEqual({});
  });

  it("rejects malformed addresses", () => {
    expect(validateKahEmailsForm({ emails: ["nope"] }).emails).toContain("nope");
    expect(validateKahEmailsForm({ emails: ["a@b"] }).emails).toBeTruthy();
  });

  it("rejects over-long addresses and oversized lists", () => {
    expect(validateKahEmailsForm({ emails: ["x".repeat(255)] }).emails).toBeTruthy();
    expect(
      validateKahEmailsForm({
        emails: Array.from({ length: 11 }, (_, i) => `u${i}@x.com`),
      }).emails,
    ).toContain("At most");
  });
});
