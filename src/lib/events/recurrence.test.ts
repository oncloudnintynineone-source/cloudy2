import { describe, expect, it } from "vitest";

import {
  expandOccurrences,
  lastOccurrence,
  normalizeRecurrence,
  occurrenceIndex,
  parseRRule,
  recurrenceSummary,
  recurrenceToRRule,
  remainingRecurrence,
  validateRecurrence,
  type RecurrenceRule,
} from "./recurrence";

const daily = (patch: Partial<RecurrenceRule> = {}): RecurrenceRule => ({
  freq: "daily",
  interval: 1,
  ...patch,
});

describe("normalizeRecurrence", () => {
  it("returns null for missing or invalid input", () => {
    expect(normalizeRecurrence(null, "2026-01-01 09:00:00")).toBeNull();
    expect(normalizeRecurrence({ freq: "hourly" }, "2026-01-01 09:00:00")).toBeNull();
  });

  it("defaults a weekly rule to the start weekday", () => {
    expect(normalizeRecurrence({ freq: "weekly" }, "2026-01-05 09:00:00")).toEqual({
      freq: "weekly",
      interval: 1,
      byWeekday: [1],
    });
  });

  it("clamps the interval and prefers an end date over a count", () => {
    expect(
      normalizeRecurrence(
        { freq: "daily", interval: 1000, count: 5, until: "2026-02-01" },
        "2026-01-01 09:00:00",
      ),
    ).toEqual({ freq: "daily", interval: 99, until: "2026-02-01" });
  });
});

describe("validateRecurrence", () => {
  it("accepts a valid count rule and rejects an inverted until", () => {
    expect(validateRecurrence(daily({ count: 3 }), "2026-01-01 09:00:00")).toBeNull();
    expect(validateRecurrence(daily({ until: "2025-12-31" }), "2026-01-01 09:00:00")).toBe(
      "End of repeat must be on or after the first occurrence",
    );
  });

  it("requires the start weekday for a weekly rule", () => {
    expect(
      validateRecurrence(
        { freq: "weekly", interval: 1, byWeekday: [2] },
        "2026-01-05 09:00:00",
      ),
    ).toBe("Keep the start day selected for a weekly repeat");
  });

  it("rejects both a count and an until", () => {
    expect(
      validateRecurrence(
        daily({ count: 3, until: "2026-02-01" }),
        "2026-01-01 09:00:00",
      ),
    ).toBe("Choose either a number of occurrences or an end date");
  });
});

describe("recurrenceToRRule / parseRRule", () => {
  it("formats a timed UNTIL as the last instant of the SGT end date", () => {
    expect(recurrenceToRRule(daily({ until: "2026-01-31" }), "2026-01-01 09:00:00", false)).toBe(
      "RRULE:FREQ=DAILY;INTERVAL=1;UNTIL=20260131T155959Z",
    );
  });

  it("formats an all-day UNTIL as a date", () => {
    expect(recurrenceToRRule(daily({ until: "2026-01-31" }), "2026-01-01 00:00:00", true)).toBe(
      "RRULE:FREQ=DAILY;INTERVAL=1;UNTIL=20260131",
    );
  });

  it("round-trips a weekly rule and preserves EXDATE lines", () => {
    const line = recurrenceToRRule(
      { freq: "weekly", interval: 2, byWeekday: [1, 3], count: 6 },
      "2026-01-05 09:00:00",
      false,
    );
    const parsed = parseRRule([line, "EXDATE;TZID=Asia/Singapore:20260119T090000"]);
    expect(parsed.supported).toBe(true);
    expect(parsed.rule).toEqual({ freq: "weekly", interval: 2, byWeekday: [1, 3], count: 6 });
    expect(parsed.extraLines).toEqual(["EXDATE;TZID=Asia/Singapore:20260119T090000"]);
  });
});

describe("expandOccurrences", () => {
  it("expands every N days within a count", () => {
    expect(
      expandOccurrences(
        daily({ interval: 2, count: 3 }),
        "2026-01-01 09:00:00",
        "2026-01-01",
        "2026-01-31",
      ),
    ).toEqual(["2026-01-01 09:00:00", "2026-01-03 09:00:00", "2026-01-05 09:00:00"]);
  });

  it("expands weekly on the selected weekdays", () => {
    expect(
      expandOccurrences(
        { freq: "weekly", interval: 1, byWeekday: [1, 3] },
        "2026-01-05 09:00:00",
        "2026-01-05",
        "2026-01-14",
      ),
    ).toEqual([
      "2026-01-05 09:00:00",
      "2026-01-07 09:00:00",
      "2026-01-12 09:00:00",
      "2026-01-14 09:00:00",
    ]);
  });

  it("skips months without the start day and non-leap Feb 29", () => {
    expect(
      expandOccurrences(
        { freq: "monthly", interval: 1 },
        "2026-01-31 09:00:00",
        "2026-01-01",
        "2026-04-30",
      ),
    ).toEqual(["2026-01-31 09:00:00", "2026-03-31 09:00:00"]);
    expect(
      expandOccurrences(
        { freq: "yearly", interval: 1 },
        "2024-02-29 09:00:00",
        "2024-01-01",
        "2029-12-31",
      ),
    ).toEqual(["2024-02-29 09:00:00", "2028-02-29 09:00:00"]);
  });
});

describe("occurrenceIndex / remainingRecurrence / lastOccurrence", () => {
  it("counts occurrences and computes the remaining count for a split", () => {
    const rule: RecurrenceRule = { freq: "weekly", interval: 1, byWeekday: [1], count: 10 };
    expect(occurrenceIndex(rule, "2026-01-05 09:00:00", "2026-01-19 09:00:00")).toBe(3);
    expect(remainingRecurrence(rule, "2026-01-05 09:00:00", "2026-01-19 09:00:00")).toEqual({
      ...rule,
      count: 8,
    });
    expect(lastOccurrence(rule, "2026-01-05 09:00:00")).toBe("2026-03-09 09:00:00");
    expect(lastOccurrence({ freq: "daily", interval: 1 }, "2026-01-01 09:00:00")).toBeNull();
  });
});

describe("recurrenceSummary", () => {
  it("summarises frequency and duration", () => {
    expect(
      recurrenceSummary(
        { freq: "weekly", interval: 2, byWeekday: [1, 3], count: 10 },
        "2026-01-05 09:00:00",
      ),
    ).toBe("Every 2 weeks on Mon, Wed · 10 times");
    expect(recurrenceSummary(daily({ until: "2026-01-31" }), "2026-01-01 09:00:00")).toBe(
      "Every day · until 31 Jan 2026",
    );
  });
});
