import { describe, expect, it } from "vitest";

import {
  encodeEventNotes,
  encodeNotesBlock,
  parseEventNotes,
  withEditLink,
  withInternalMarker,
  withRemarks,
} from "@/lib/events/notes";
import {
  defaultMigrationRange,
  isDateOnly,
  isMigrationCursor,
  matchesMigrationSource,
  migrationMonthBounds,
  migrationMonthDays,
  migrationYears,
  replaceTypeNameInFilters,
  rewriteEventTypeNotes,
  selectMigrationBatch,
  validateMigrationRange,
  MIGRATION_DEFAULT_FROM_MONTH,
} from "./migration";

const EDIT_URL = "https://app.example.com/dashboard?date=2026-01-02&event=evt-1&_eventCal=cal-1";

function v3Description(notes: Record<string, unknown>): string {
  return withInternalMarker(withEditLink(encodeNotesBlock(encodeEventNotes(notes)), EDIT_URL));
}

function v2Description(notes: Record<string, unknown>): string {
  return withInternalMarker(withEditLink(encodeEventNotes(notes), EDIT_URL));
}

describe("defaultMigrationRange", () => {
  it("starts at the hardcoded Jun 2026 floor, two years after today's month", () => {
    expect(defaultMigrationRange(new Date("2026-11-12T00:00:00Z"))).toEqual({
      fromMonth: MIGRATION_DEFAULT_FROM_MONTH,
      toMonth: "2028-11",
    });
  });

  it("keeps the hardcoded floor whatever today is", () => {
    expect(defaultMigrationRange(new Date("2027-01-05T00:00:00Z"))).toEqual({
      fromMonth: "2026-06",
      toMonth: "2029-01",
    });
  });
});

describe("migrationMonthDays", () => {
  it("expands a month window to whole-month day bounds", () => {
    expect(migrationMonthDays("2026-06", "2028-11")).toEqual({
      fromDate: "2026-06-01",
      toDate: "2028-11-30",
    });
  });

  it("ends on the real last civil day, leap Februaries included", () => {
    expect(migrationMonthDays("2028-02", "2028-02")).toEqual({
      fromDate: "2028-02-01",
      toDate: "2028-02-29",
    });
    expect(migrationMonthDays("2027-02", "2027-02")).toEqual({
      fromDate: "2027-02-01",
      toDate: "2027-02-28",
    });
  });

  it("expands the default window to a range the day-level validator accepts", () => {
    const now = new Date("2026-11-12T00:00:00Z");
    const { fromMonth, toMonth } = defaultMigrationRange(now);
    const days = migrationMonthDays(fromMonth, toMonth);
    expect(validateMigrationRange(days.fromDate, days.toDate, now)).toEqual({});
  });
});

describe("migrationMonthBounds", () => {
  it("keeps the 1970-01 escape hatch and the +20-year ceiling", () => {
    expect(migrationMonthBounds(new Date("2026-11-12T00:00:00Z"))).toEqual({
      minMonth: "1970-01",
      maxMonth: "2046-12",
    });
  });
});

describe("isDateOnly", () => {
  it("accepts a real calendar date only", () => {
    expect(isDateOnly("2026-01-31")).toBe(true);
    expect(isDateOnly("2026-02-31")).toBe(false);
    expect(isDateOnly("2026-1-1")).toBe(false);
    expect(isDateOnly("")).toBe(false);
  });
});

describe("validateMigrationRange", () => {
  const now = new Date("2026-11-12T00:00:00Z");

  it("accepts the default range", () => {
    expect(validateMigrationRange("2000-01-01", "2028-12-31", now)).toEqual({});
  });

  it("rejects malformed and reversed dates", () => {
    expect(validateMigrationRange("nope", "2026-01-01", now).fromDate).toBeDefined();
    expect(validateMigrationRange("2026-01-02", "2026-01-01", now).toDate).toContain("on or after");
  });

  it("enforces the hard date bounds", () => {
    expect(validateMigrationRange("1969-12-31", "2026-01-01", now).fromDate).toContain("1970");
    expect(validateMigrationRange("2000-01-01", "2047-01-01", now).toDate).toContain("2046-12-31");
  });
});

describe("migrationYears", () => {
  it("splits a full range into clipped year windows", () => {
    const years = migrationYears("2024-03-15", "2026-02-10");
    expect(years.map((window) => window.year)).toEqual([2024, 2025, 2026]);
    expect(years[0].start.toISOString()).toBe("2024-03-14T16:00:00.000Z");
    expect(years[1].end.toISOString()).toBe("2025-12-31T16:00:00.000Z");
    expect(years[2].end.toISOString()).toBe("2026-02-10T16:00:00.000Z");
  });

  it("handles a single-day range and malformed input", () => {
    expect(migrationYears("2026-05-05", "2026-05-05")).toHaveLength(1);
    expect(migrationYears("2026-05-06", "2026-05-05")).toEqual([]);
    expect(migrationYears("nope", "2026-05-05")).toEqual([]);
  });
});

describe("matchesMigrationSource", () => {
  it("matches only events whose notes reference the source name", () => {
    const description = v3Description({ eventType: "Leave", title: "Away" });
    expect(matchesMigrationSource(description, "Leave")).toBe(true);
    expect(matchesMigrationSource(description, "Duty")).toBe(false);
    expect(matchesMigrationSource("plain external notes", "Leave")).toBe(false);
  });
});

describe("rewriteEventTypeNotes", () => {
  it("rewrites a v3 block and preserves the edit link, marker, and other fields", () => {
    const description = v3Description({
      eventType: "Old type",
      eventId: "evt-1",
      title: "Original description",
      inviteeUsers: ["u1", "u2"],
      pinned: true,
    });

    const result = rewriteEventTypeNotes(description, "Old type", "New type");

    expect(result.matched).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.description.startsWith(`Edit: ${EDIT_URL}`)).toBe(true);
    expect(result.description.endsWith("Created in cloudy2")).toBe(true);
    expect(parseEventNotes(result.description)).toMatchObject({
      eventType: "New type",
      eventId: "evt-1",
      title: "Original description",
      inviteeUsers: ["u1", "u2"],
      pinned: true,
    });
  });

  it("rewrites the legacy raw-JSON line (v2)", () => {
    const description = v2Description({ eventType: "Old type", title: "Away" });
    const result = rewriteEventTypeNotes(description, "Old type", "New type");
    expect(result.description.startsWith(`Edit: ${EDIT_URL}`)).toBe(true);
    expect(result.description.endsWith("Created in cloudy2")).toBe(true);
    expect(parseEventNotes(result.description)?.eventType).toBe("New type");
  });

  it("preserves the plain-text remarks line above the edit link", () => {
    const description = withRemarks(
      v3Description({ eventType: "Old type", remarks: "Wear whites." }),
      "Wear whites.",
    );
    const result = rewriteEventTypeNotes(description, "Old type", "New type");
    expect(result.changed).toBe(true);
    expect(result.description.startsWith("Wear whites.\n\nEdit: ")).toBe(true);
    expect(result.description.endsWith("Created in cloudy2")).toBe(true);
    expect(parseEventNotes(result.description)).toMatchObject({
      eventType: "New type",
      remarks: "Wear whites.",
    });
  });

  it("rewrites the legacy JSON-only description (v1)", () => {
    const result = rewriteEventTypeNotes('{"eventType":"Old type"}', "Old type", "New type");
    expect(result.changed).toBe(true);
    expect(parseEventNotes(result.description)?.eventType).toBe("New type");
  });

  it("is a no-op for other types and for title-only refreshes", () => {
    const description = v3Description({ eventType: "Other" });
    expect(rewriteEventTypeNotes(description, "Old type", "New type")).toEqual({
      matched: false,
      changed: false,
      description,
    });

    const sameName = v3Description({ eventType: "Old type" });
    expect(rewriteEventTypeNotes(sameName, "Old type", "Old type")).toEqual({
      matched: true,
      changed: false,
      description: sameName,
    });
  });
});

describe("replaceTypeNameInFilters", () => {
  it("keeps null and rewrites deduped entries in order", () => {
    expect(replaceTypeNameInFilters(null, "Old", "New")).toBeNull();
    expect(replaceTypeNameInFilters(["Old", "Duty", "Old"], "Old", "New")).toEqual(["New", "Duty"]);
    expect(replaceTypeNameInFilters([42, "", "Old"], "Old", "New")).toEqual(["New"]);
  });
});

describe("isMigrationCursor", () => {
  it("accepts in-range cursors and rejects malformed ones", () => {
    expect(
      isMigrationCursor({ yearIndex: 0, calendarIndex: 0, pageToken: null, skip: 0 }, 3, 2),
    ).toBe(true);
    expect(
      isMigrationCursor({ yearIndex: 3, calendarIndex: 0, pageToken: null, skip: 0 }, 3, 2),
    ).toBe(false);
    expect(
      isMigrationCursor({ yearIndex: 0, calendarIndex: 2, pageToken: null, skip: 0 }, 3, 2),
    ).toBe(false);
    expect(isMigrationCursor({ yearIndex: 0, calendarIndex: 0, skip: -1 }, 3, 2)).toBe(false);
    expect(isMigrationCursor(null, 3, 2)).toBe(false);
  });
});

describe("selectMigrationBatch", () => {
  const match = (name: string) => v3Description({ eventType: name });
  const other = v3Description({ eventType: "Other" });

  it("selects matching items and reports the page offset consumed", () => {
    const items = [
      { description: other },
      { description: match("Old") },
      { description: other },
      { description: match("Old") },
    ];
    const batch = selectMigrationBatch(items, "Old", 10);
    expect(batch.selected).toHaveLength(2);
    expect(batch.consumed).toBe(4);
    expect(batch.stopped).toBe(false);
  });

  it("stops exactly at the budget without consuming the next item", () => {
    const items = [
      { description: match("Old") },
      { description: match("Old") },
      { description: match("Old") },
    ];
    const batch = selectMigrationBatch(items, "Old", 2);
    expect(batch.selected).toHaveLength(2);
    expect(batch.consumed).toBe(2);
    expect(batch.stopped).toBe(true);
  });

  it("handles an exhausted budget and an empty page", () => {
    const items = [{ description: match("Old") }];
    expect(selectMigrationBatch(items, "Old", 0)).toEqual({
      selected: [],
      consumed: 0,
      stopped: true,
    });
    expect(selectMigrationBatch([], "Old", 5)).toEqual({
      selected: [],
      consumed: 0,
      stopped: false,
    });
  });
});
