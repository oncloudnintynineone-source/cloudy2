import { describe, expect, it } from "vitest";

import { auditTimeSortKey, formatMyEventTime, mergeMyEvents, type MyEventRow } from "./myEvents";

function row(partial: Partial<MyEventRow> & { key: string; sortKey: string }): MyEventRow {
  return {
    eventId: partial.key,
    title: partial.key,
    time: "",
    departments: [],
    deleted: false,
    ...partial,
  };
}

describe("formatMyEventTime", () => {
  it("renders a same-day timed range", () => {
    expect(formatMyEventTime(false, "2026-08-21 14:00:00", "2026-08-21 15:30:00")).toBe(
      "2026-08-21 14:00 \u2013 15:30",
    );
  });

  it("spans days for a multi-day timed event", () => {
    expect(formatMyEventTime(false, "2026-08-21 14:00:00", "2026-08-23 09:30:00")).toBe(
      "2026-08-21 14:00 \u2013 2026-08-23 09:30",
    );
  });

  it("uses the inclusive last day for all-day events (Google end is exclusive)", () => {
    expect(formatMyEventTime(true, "2026-08-21 00:00:00", "2026-08-22 00:00:00")).toBe("2026-08-21");
    expect(formatMyEventTime(true, "2026-08-21 00:00:00", "2026-08-24 00:00:00")).toBe(
      "2026-08-21 \u2013 2026-08-23",
    );
  });
});

describe("auditTimeSortKey", () => {
  it("uses the clock when present", () => {
    expect(auditTimeSortKey("2026-08-21 14:00 \u2013 15:30")).toBe("2026-08-21 14:00");
  });

  it("sorts AM/PM-marker day events as midnight", () => {
    expect(auditTimeSortKey("2026-08-21 (AM) \u2013 2026-08-23 (PM)")).toBe("2026-08-21 00:00");
    expect(auditTimeSortKey("2026-08-21")).toBe("2026-08-21 00:00");
  });
});

describe("mergeMyEvents", () => {
  it("drops a deleted row shadowed by a live one and orders newest first", () => {
    const active = [row({ key: "a", sortKey: "2026-08-10 09:00" })];
    const deleted = [
      row({ key: "a", sortKey: "2026-08-10 09:00", deleted: true }),
      row({ key: "b", sortKey: "2026-08-12 09:00", deleted: true }),
    ];
    const merged = mergeMyEvents(active, deleted);
    expect(merged.map((entry) => entry.key)).toEqual(["b", "a"]);
    expect(merged.find((entry) => entry.key === "b")?.deleted).toBe(true);
    expect(merged.filter((entry) => entry.key === "a")).toHaveLength(1);
  });

  it("keeps legacy deleted rows without a group id", () => {
    const merged = mergeMyEvents([], [row({ key: "legacy", eventId: null, sortKey: "2026-08-01 00:00", deleted: true })]);
    expect(merged).toHaveLength(1);
  });
});
