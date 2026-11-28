import { describe, expect, it } from "vitest";

import type { CalendarEvent } from "./queries";
import {
  coerceSearchMonths,
  countSubstringMatches,
  defaultSearchMonths,
  eventSubstringMatch,
  eventWithinRange,
  filterRangeForSearch,
  MONTH_KEY_PATTERN,
  monthEnd,
  monthRangeLabel,
  monthStart,
  searchMatchTier,
  SEARCH_MAX_RANGE_MONTHS,
} from "./searchRange";

function event(overrides: {
  start: string;
  end: string;
  title?: string;
  location?: string;
  eventType?: string | null;
  allDay?: boolean;
}): CalendarEvent {
  const allDay = overrides.allDay ?? false;
  return {
    id: `cal:${overrides.title ?? overrides.start}`,
    title: overrides.title ?? "(no title)",
    start: overrides.start,
    end: overrides.end,
    color: "blue",
    payload: {
      calendarId: "cal",
      googleEventId: "g",
      allDay,
      eventType: overrides.eventType ?? null,
      calendarName: "Logistics",
      eventId: null,
      creatorId: null,
      inviteeUserIds: [],
      inviteeDepartmentIds: [],
      ownerOnlyEdits: false,
      registrationEnabled: false,
      registrationCap: null,
      rawTitle: null,
      timeOption: allDay ? "full" : "range",
      startAmPm: null,
      endAmPm: null,
      outOfCamp: false,
      overseas: false,
      pinned: false,
      location: overrides.location ?? "",
      external: false,
    },
  };
}

describe("month window", () => {
  it("accepts only `YYYY-MM` keys", () => {
    expect(MONTH_KEY_PATTERN.test("2026-11")).toBe(true);
    expect(MONTH_KEY_PATTERN.test("2026-11-21")).toBe(false);
    expect(MONTH_KEY_PATTERN.test("2026-1")).toBe(false);
    expect(MONTH_KEY_PATTERN.test("")).toBe(false);
  });

  it("expands a month to its first and last day (leap years included)", () => {
    expect(monthStart("2026-11")).toBe("2026-11-01");
    expect(monthEnd("2026-11")).toBe("2026-11-30");
    expect(monthEnd("2026-02")).toBe("2026-02-28");
    expect(monthEnd("2028-02")).toBe("2028-02-29");
  });

  it("defaults to one month back through three months ahead", () => {
    expect(defaultSearchMonths("2026-11-21")).toEqual({ fromMonth: "2026-10", toMonth: "2027-02" });
  });

  it("wraps the default window across the year boundary", () => {
    expect(defaultSearchMonths("2026-12-31")).toEqual({ fromMonth: "2026-11", toMonth: "2027-03" });
    expect(defaultSearchMonths("2027-01-05")).toEqual({ fromMonth: "2026-12", toMonth: "2027-04" });
  });

  it("keeps an ordered window and swaps a reversed pair", () => {
    expect(coerceSearchMonths("2026-10", "2027-02")).toEqual({
      fromMonth: "2026-10",
      toMonth: "2027-02",
    });
    expect(coerceSearchMonths("2027-02", "2026-10")).toEqual({
      fromMonth: "2026-10",
      toMonth: "2027-02",
    });
    expect(coerceSearchMonths("2026-11", "2026-11")).toEqual({
      fromMonth: "2026-11",
      toMonth: "2026-11",
    });
  });

  it("clamps a window wider than the cap to its `from` month", () => {
    // The cap is inclusive: `from` counts as month 1.
    expect(coerceSearchMonths("2026-01", "2027-12")).toEqual({
      fromMonth: "2026-01",
      toMonth: "2027-12",
    });
    expect(coerceSearchMonths("2026-01", "2029-05")).toEqual({
      fromMonth: "2026-01",
      toMonth: "2027-12",
    });
    expect(SEARCH_MAX_RANGE_MONTHS).toBe(24);
  });

  it("labels the window the way the results header names the scope", () => {
    expect(monthRangeLabel("2026-11", "2027-02")).toBe("Nov 2026 – Feb 2027");
    expect(monthRangeLabel("2026-11", "2026-11")).toBe("Nov 2026");
  });
});

describe("eventWithinRange", () => {
  it("includes an all-day event on the window's last day (exclusive Google end)", () => {
    const e = event({ start: "2026-09-24 00:00:00", end: "2026-09-25 00:00:00", allDay: true });
    expect(eventWithinRange(e, "2026-09-24", "2026-09-24")).toBe(true);
  });

  it("excludes an event wholly outside the window", () => {
    const e = event({ start: "2026-09-24 00:00:00", end: "2026-09-25 00:00:00", allDay: true });
    expect(eventWithinRange(e, "2026-09-20", "2026-09-21")).toBe(false);
  });

  it("includes a timed event that overlaps the window edge", () => {
    const e = event({ start: "2026-09-24 23:00:00", end: "2026-09-25 01:00:00" });
    expect(eventWithinRange(e, "2026-09-24", "2026-09-24")).toBe(true);
  });
});

describe("filterRangeForSearch", () => {
  const EVENTS = [
    event({ start: "2026-09-22 09:00:00", end: "2026-09-22 10:00:00", title: "Old briefing" }),
    event({
      start: "2026-09-24 09:00:00",
      end: "2026-09-24 10:00:00",
      title: "Safety briefing",
      location: "Sembawang",
    }),
    event({ start: "2026-09-26 09:00:00", end: "2026-09-26 10:00:00", title: "Logistics review" }),
  ];

  it("trims to the exact window and returns chronological order for a blank query", () => {
    const result = filterRangeForSearch(EVENTS, "2026-09-23", "2026-09-25", "");
    expect(result.map((e) => e.title)).toEqual(["Safety briefing"]);
  });

  it("fuzzy-matches a typo in the title", () => {
    const result = filterRangeForSearch(EVENTS, "2026-09-23", "2026-09-25", "brieffng");
    expect(result.map((e) => e.title)).toEqual(["Safety briefing"]);
  });

  it("matches the location", () => {
    const result = filterRangeForSearch(EVENTS, "2026-09-23", "2026-09-25", "sembawng");
    expect(result.map((e) => e.title)).toEqual(["Safety briefing"]);
  });

  it("returns matches in relevance order (best score first)", () => {
    const ranked = [
      event({
        start: "2026-09-24 09:00:00",
        end: "2026-09-24 10:00:00",
        title: "Quarterly report",
      }),
      event({ start: "2026-09-24 11:00:00", end: "2026-09-24 12:00:00", title: "Report" }),
    ];
    const result = filterRangeForSearch(ranked, "2026-09-24", "2026-09-24", "report");
    expect(result.map((e) => e.title)).toEqual(["Report", "Quarterly report"]);
  });

  it("puts literal substring hits ahead of typo-tolerant ones", () => {
    const tiered = [
      event({ start: "2026-09-24 09:00:00", end: "2026-09-24 10:00:00", title: "Brieffng recap" }),
      event({
        start: "2026-09-24 11:00:00",
        end: "2026-09-24 12:00:00",
        title: "Safety briefing for all departments and contractors",
      }),
    ];
    const result = filterRangeForSearch(tiered, "2026-09-24", "2026-09-24", "briefing");
    expect(result.map((e) => e.title)).toEqual([
      "Safety briefing for all departments and contractors",
      "Brieffng recap",
    ]);
  });
});

describe("countSubstringMatches", () => {
  const literal = event({
    start: "2026-09-24 09:00:00",
    end: "2026-09-24 10:00:00",
    title: "Safety briefing for all departments and contractors",
  });
  const typo = event({
    start: "2026-09-24 11:00:00",
    end: "2026-09-24 12:00:00",
    title: "Brieffng recap",
  });
  const alpha = event({
    start: "2026-09-24 13:00:00",
    end: "2026-09-24 14:00:00",
    title: "Alpha convoy",
  });
  const alphaAgain = event({
    start: "2026-09-24 15:00:00",
    end: "2026-09-24 16:00:00",
    title: "Alpha muster",
  });

  it("is the split index between the two tiers of a ranked result list", () => {
    const results = filterRangeForSearch([typo, literal], "2026-09-24", "2026-09-24", "briefing");
    expect(results.map((e) => e.title)).toEqual([literal.title, typo.title]);
    expect(countSubstringMatches(results, "briefing")).toBe(1);
  });

  it("counts every result when all of them contain the query verbatim", () => {
    expect(countSubstringMatches([alpha, alphaAgain], "alpha")).toBe(2);
    expect(countSubstringMatches([alpha], "ALPHA")).toBe(1);
  });

  it("returns 0 when no result contains the query verbatim", () => {
    expect(countSubstringMatches([literal, alpha], "brieffng")).toBe(0);
  });

  it("stops at the first typo-only row — the tiers are contiguous", () => {
    expect(countSubstringMatches([alpha, typo, alphaAgain], "alpha")).toBe(1);
  });

  it("counts everything for a blank query", () => {
    expect(countSubstringMatches([alpha, typo], "   ")).toBe(2);
  });
});

describe("searchMatchTier", () => {
  const event2 = event({
    start: "2026-09-24 09:00:00",
    end: "2026-09-24 10:00:00",
    title: "Safety briefing",
    location: "Sembawang",
    eventType: "Training",
  });

  it("classifies a verbatim field hit as substring, case-insensitively", () => {
    expect(searchMatchTier(event2, "brief")).toBe("substring");
    expect(searchMatchTier(event2, "SEmb")).toBe("substring");
    expect(searchMatchTier(event2, "training")).toBe("substring");
    expect(searchMatchTier(event2, "logistic")).toBe("substring");
  });

  it("classifies a typo-only hit as fuzzy", () => {
    expect(searchMatchTier(event2, "brieffng")).toBe("fuzzy");
    expect(searchMatchTier(event2, "sembawng")).toBe("fuzzy");
  });

  it("treats a blank query as a substring match", () => {
    expect(eventSubstringMatch(event2, "   ")).toBe(true);
  });
});
