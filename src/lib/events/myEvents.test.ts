import { describe, expect, it } from "vitest";

import {
  auditTimeSortKey,
  formatMyEventTime,
  humanizeMyEventTime,
  mergeMyEvents,
  type MyEventRow,
} from "./myEvents";

function row(partial: Partial<MyEventRow> & { key: string; sortKey: string }): MyEventRow {
  return {
    eventId: partial.key,
    title: partial.key,
    time: "",
    editKey: null,
    departments: [],
    deleted: false,
    color: "blue",
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

describe("humanizeMyEventTime", () => {
  it("drops the year for current-year dates and abbreviates the month", () => {
    expect(humanizeMyEventTime("2026-08-21", "2026")).toBe("21 Aug");
    expect(humanizeMyEventTime("2025-08-21", "2026")).toBe("21 Aug 2025");
  });

  it("collapses a same-month all-day span", () => {
    expect(humanizeMyEventTime("2026-08-21 \u2013 2026-08-23", "2026")).toBe("21 \u2013 23 Aug");
    expect(humanizeMyEventTime("2026-08-21 \u2013 2026-09-02", "2026")).toBe("21 Aug \u2013 2 Sep");
  });

  it("keeps clocks and AM/PM markers", () => {
    expect(humanizeMyEventTime("2026-08-21 14:00 \u2013 15:30", "2026")).toBe("21 Aug 14:00 \u2013 15:30");
    expect(humanizeMyEventTime("2026-08-21 (AM) \u2013 2026-08-23 (PM)", "2026")).toBe(
      "21 Aug (AM) \u2013 23 Aug (PM)",
    );
    expect(humanizeMyEventTime("2026-08-21 (AM\u2013PM)", "2026")).toBe("21 Aug (AM\u2013PM)");
  });

  it("does not collapse a timed multi-day span (clocks stay on both sides)", () => {
    expect(humanizeMyEventTime("2026-08-21 14:00 \u2013 2026-08-23 09:30", "2026")).toBe(
      "21 Aug 14:00 \u2013 23 Aug 09:30",
    );
  });
});

describe("mergeMyEvents", () => {
  it("drops a deleted row shadowed by a live one and falls back to start order without audit history", () => {
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

  it("ranks by last edit, ahead of start order", () => {
    const active = [
      row({ key: "a", sortKey: "2026-08-01 09:00", editKey: "2026-08-20 10:00" }),
      row({ key: "b", sortKey: "2026-08-19 09:00" }),
    ];
    expect(mergeMyEvents(active, []).map((entry) => entry.key)).toEqual(["a", "b"]);
  });

  it("ranks a deleted row by its delete time", () => {
    const active = [row({ key: "a", sortKey: "2026-08-18 09:00", editKey: "2026-08-19 08:00" })];
    const deleted = [
      row({ key: "b", sortKey: "2026-08-01 09:00", editKey: "2026-08-20 09:00", deleted: true }),
    ];
    expect(mergeMyEvents(active, deleted).map((entry) => entry.key)).toEqual(["b", "a"]);
  });

  it("breaks equal edit keys by start (newest first), then key", () => {
    const active = [
      row({ key: "c", sortKey: "2026-08-02 09:00", editKey: "2026-08-20 10:00" }),
      row({ key: "a", sortKey: "2026-08-05 09:00", editKey: "2026-08-20 10:00" }),
      row({ key: "b", sortKey: "2026-08-04 09:00", editKey: "2026-08-20 10:00" }),
    ];
    expect(mergeMyEvents(active, []).map((entry) => entry.key)).toEqual(["a", "b", "c"]);
  });

  it("keeps legacy deleted rows without a group id", () => {
    const merged = mergeMyEvents([], [row({ key: "legacy", eventId: null, sortKey: "2026-08-01 00:00", deleted: true })]);
    expect(merged).toHaveLength(1);
  });
});
