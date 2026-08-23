import { describe, expect, it } from "vitest";

import {
  AUDIT_RETENTION_MAX,
  AUDIT_RETENTION_MIN,
  normalizeKeyword,
  normalizeRetentionDays,
  validateEventTitleTemplate,
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

describe("validateEventTitleTemplate", () => {
  it("returns no errors for a valid template", () => {
    expect(
      validateEventTitleTemplate({
        eventTitleTemplate: "{type}: {description} — {people:acronym}",
      }),
    ).toEqual({});
  });

  it("flags an empty template", () => {
    expect(validateEventTitleTemplate({ eventTitleTemplate: "  " }).eventTitleTemplate).toBe(
      "Event title template is required",
    );
  });

  it("flags an over-long template", () => {
    const long = "{description}".repeat(100);
    expect(validateEventTitleTemplate({ eventTitleTemplate: long }).eventTitleTemplate).toBe(
      "Event title template must be 200 characters or fewer",
    );
  });

  it("accepts literal text with no placeholders", () => {
    expect(validateEventTitleTemplate({ eventTitleTemplate: "Staff" })).toEqual({});
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
