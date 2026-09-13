import { describe, expect, it } from "vitest";

import {
  AUDIT_RETENTION_MAX,
  AUDIT_RETENTION_MIN,
  EVENT_TITLE_ASSIGNMENT_TARGETS,
  normalizeAssignments,
  normalizeKeyword,
  normalizeRetentionDays,
  validateAssignments,
  validateKeywordForm,
  validateNameTemplate,
  validateRetentionForm,
} from "./validate";

describe("normalizeKeyword", () => {
  it("returns a lowercase keyword unchanged", () => {
    expect(normalizeKeyword("leave")).toBe("leave");
  });

  it("lowercases uppercase input", () => {
    expect(normalizeKeyword("LEAVE")).toBe("leave");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeKeyword("  leave  ")).toBe("leave");
  });

  it("returns null for a keyword with digits", () => {
    expect(normalizeKeyword("leave123")).toBeNull();
  });

  it("returns null for a keyword with punctuation or spaces", () => {
    expect(normalizeKeyword("leave now")).toBeNull();
    expect(normalizeKeyword("leave!")).toBeNull();
  });

  it("returns null for an empty keyword", () => {
    expect(normalizeKeyword("")).toBeNull();
    expect(normalizeKeyword("   ")).toBeNull();
  });

  it("returns null for a keyword longer than 12 characters", () => {
    expect(normalizeKeyword("abcdefghijklm")).toBeNull();
  });

  it("accepts a 12-character keyword", () => {
    expect(normalizeKeyword("abcdefghijkl")).toBe("abcdefghijkl");
  });
});

describe("validateKeywordForm", () => {
  it("returns no errors for a valid keyword", () => {
    expect(validateKeywordForm({ keyword: "leave" })).toEqual({});
  });

  it("flags an empty keyword", () => {
    expect(validateKeywordForm({ keyword: "  " }).keyword).toBe("Keyword is required");
  });

  it("flags non-letter characters", () => {
    expect(validateKeywordForm({ keyword: "leave1" }).keyword).toBe(
      "Keyword must contain letters only",
    );
  });

  it("flags an over-long keyword", () => {
    expect(validateKeywordForm({ keyword: "abcdefghijklm" }).keyword).toBe(
      "Keyword must be 12 characters or fewer",
    );
  });
});

describe("validateNameTemplate", () => {
  it("returns no errors for a valid template", () => {
    expect(validateNameTemplate({ nameTemplate: "{name}: DEPT-{department}" })).toEqual({});
  });

  it("flags an empty template", () => {
    expect(validateNameTemplate({ nameTemplate: "  " }).nameTemplate).toBe(
      "Name template is required",
    );
  });

  it("flags an over-long template", () => {
    const long = "{name}".repeat(100);
    expect(validateNameTemplate({ nameTemplate: long }).nameTemplate).toBe(
      "Name template must be 200 characters or fewer",
    );
  });

  it("accepts literal text with no placeholders", () => {
    expect(validateNameTemplate({ nameTemplate: "Staff" })).toEqual({});
  });
});

describe("normalizeAssignments", () => {
  it("drops non-string and blank values", () => {
    expect(
      normalizeAssignments({ month: "", week: 5, schedule: null, agenda: "tpl-1" }),
    ).toEqual({ agenda: "tpl-1" });
  });

  it("keeps the pinned targets alongside the dashboard views", () => {
    expect(
      normalizeAssignments({ schedule: "tpl-1", pinned: "tpl-2", pinnedHeader: "tpl-1" }),
    ).toEqual({
      schedule: "tpl-1",
      pinned: "tpl-2",
      pinnedHeader: "tpl-1",
    });
  });

  it("ignores unknown keys", () => {
    expect(normalizeAssignments({ schedule: "tpl-1", nonsense: "tpl-2", pinned: "" })).toEqual({
      schedule: "tpl-1",
    });
  });

  it("returns an empty map for non-object input", () => {
    expect(normalizeAssignments(null)).toEqual({});
    expect(normalizeAssignments("x")).toEqual({});
    expect(normalizeAssignments([])).toEqual({});
  });
});

describe("validateAssignments", () => {
  const knownIds = new Set(["tpl-1", "tpl-2"]);

  it("accepts known template ids on any target including the pinned ones", () => {
    expect(
      validateAssignments({ schedule: "tpl-1", pinned: "tpl-2", pinnedHeader: "tpl-1" }, knownIds),
    ).toEqual({});
  });

  it("rejects unknown template ids with the target as the key", () => {
    expect(validateAssignments({ pinned: "missing", pinnedHeader: "nope" }, knownIds)).toEqual({
      pinned: "Unknown template",
      pinnedHeader: "Unknown template",
    });
  });

  it("treats blanks as unassigned (master fallback)", () => {
    expect(
      validateAssignments({ pinned: "", pinnedHeader: null, schedule: null }, knownIds),
    ).toEqual({});
  });

  it("defines the six dashboard views plus pinned, double-booking, and notification targets", () => {
    expect(EVENT_TITLE_ASSIGNMENT_TARGETS).toEqual([
      "month",
      "week",
      "weekv2",
      "schedule",
      "agenda",
      "dual",
      "pinned",
      "pinnedHeader",
      "doubleBooking",
      "notifyCreated",
      "notifyAdded",
    ]);
  });
});

describe("normalizeRetentionDays", () => {
  it("clamps below the minimum", () => {
    expect(normalizeRetentionDays(1)).toBe(AUDIT_RETENTION_MIN);
  });

  it("clamps above the maximum", () => {
    expect(normalizeRetentionDays(1000)).toBe(AUDIT_RETENTION_MAX);
  });

  it("rounds fractional input", () => {
    expect(normalizeRetentionDays(30.6)).toBe(31);
  });

  it("falls back to the default for non-finite input", () => {
    expect(normalizeRetentionDays(Number.NaN)).toBe(90);
    expect(normalizeRetentionDays("abc" as unknown as number)).toBe(90);
  });

  it("passes a value in range through", () => {
    expect(normalizeRetentionDays(90)).toBe(90);
  });
});

describe("validateRetentionForm", () => {
  it("returns no errors for a valid retention value", () => {
    expect(validateRetentionForm({ retentionDays: 90 })).toEqual({});
  });

  it("flags a value below the minimum", () => {
    expect(validateRetentionForm({ retentionDays: 3 }).retentionDays).toBe(
      `Retention must be at least ${AUDIT_RETENTION_MIN} days`,
    );
  });

  it("flags a value above the maximum", () => {
    expect(validateRetentionForm({ retentionDays: 500 }).retentionDays).toBe(
      `Retention must be at most ${AUDIT_RETENTION_MAX} days`,
    );
  });
});
