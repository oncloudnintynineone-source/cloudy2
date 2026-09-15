import { describe, expect, it } from "vitest";

import { addOneDay, subOneDay, weekDays } from "./datetime";
import type { CalendarEvent } from "./queries";
import { gridWeekAllDayLayout } from "./gridWeek";

// A concrete week (Monday-first) used across the cases; referenced by index
// so the assertions never rely on a hard-coded weekday.
const WEEK = weekDays("2026-08-17");

function makeEvent(
  start: string,
  // End is stored verbatim; for all-day events that is Google's *exclusive*
  // end date (the day after the last day).
  end: string,
  overrides: Partial<CalendarEvent["payload"]> & { title?: string } = {},
): CalendarEvent {
  const payload: CalendarEvent["payload"] = {
    calendarId: "cal-1",
    googleEventId: `google-${start}-${end}`,
    allDay: overrides.allDay ?? false,
    eventType: null,
    calendarName: "Dept A",
    eventId: overrides.eventId ?? null,
    creatorId: overrides.creatorId ?? null,
    inviteeUserIds: overrides.inviteeUserIds ?? [],
    inviteeDepartmentIds: overrides.inviteeDepartmentIds ?? [],
    rawTitle: null,
    timeOption: overrides.timeOption ?? "range",
    startAmPm: overrides.startAmPm ?? null,
    endAmPm: overrides.endAmPm ?? null,
    outOfCamp: overrides.outOfCamp ?? false,
    overseas: overrides.overseas ?? false,
    pinned: overrides.pinned ?? false,
    ownerOnlyEdits: overrides.ownerOnlyEdits ?? false,
    location: overrides.location ?? "",
    external: overrides.external ?? false,
  };
  return {
    id: `cal-1:${payload.googleEventId}`,
    title: overrides.title ?? "Test event",
    start,
    end,
    color: "blue",
    payload,
  };
}

/** A one-day all-day event on `day` (Google's exclusive end = next day). */
function allDayOn(day: string, title: string): CalendarEvent {
  return makeEvent(`${day} 00:00:00`, `${addOneDay(day)} 00:00:00`, { allDay: true, title });
}

describe("gridWeekAllDayLayout", () => {
  it("returns an empty layout when the week has no days", () => {
    const layout = gridWeekAllDayLayout([allDayOn(WEEK[0], "A")], []);
    expect(layout).toEqual({ laneCount: 0, hidden: [], hiddenIds: new Set() });
  });

  it("returns an empty layout when there are no all-day events", () => {
    const event = makeEvent(`${WEEK[0]} 09:00:00`, `${WEEK[0]} 11:00:00`);
    const layout = gridWeekAllDayLayout([event], WEEK);
    expect(layout.laneCount).toBe(0);
    expect(layout.hidden).toEqual([]);
  });

  it("keeps a single full-day event in the first lane", () => {
    const layout = gridWeekAllDayLayout([allDayOn(WEEK[2], "A")], WEEK);
    expect(layout.laneCount).toBe(1);
    expect(layout.hidden).toEqual([]);
  });

  it("stacks two overlapping full-day events into two lanes", () => {
    const layout = gridWeekAllDayLayout(
      [allDayOn(WEEK[1], "A"), allDayOn(WEEK[1], "B")],
      WEEK,
    );
    expect(layout.laneCount).toBe(2);
    expect(layout.hidden).toEqual([]);
  });

  it("hides the third overlapping lane and reports its id", () => {
    const events = [allDayOn(WEEK[1], "A"), allDayOn(WEEK[1], "B"), allDayOn(WEEK[1], "C")];
    const layout = gridWeekAllDayLayout(events, WEEK);
    expect(layout.laneCount).toBe(3);
    expect(layout.hidden.map((event) => event.title)).toEqual(["C"]);
    expect(layout.hiddenIds).toEqual(new Set([events[2].id]));
  });

  it("shares a lane across non-overlapping days", () => {
    const layout = gridWeekAllDayLayout(
      [allDayOn(WEEK[0], "Mon"), allDayOn(WEEK[3], "Thu")],
      WEEK,
    );
    expect(layout.laneCount).toBe(1);
    expect(layout.hidden).toEqual([]);
  });

  it("counts a multi-day timed event as all-day and overlaps its days", () => {
    // Tuesday 09:00 through Thursday 10:00 (a timed event spanning days).
    const event = makeEvent(`${WEEK[1]} 09:00:00`, `${WEEK[3]} 10:00:00`, { title: "Multi" });
    const sameDay = allDayOn(WEEK[2], "Wed");
    const layout = gridWeekAllDayLayout([event, sameDay], WEEK);
    expect(layout.laneCount).toBe(2);
    expect(layout.hidden).toEqual([]);
  });

  it("excludes half-day events (they render on the timed grid)", () => {
    const am = makeEvent(`${WEEK[1]} 00:00:00`, `${WEEK[1]} 12:00:00`, {
      allDay: true,
      title: "AM",
    });
    const pm = makeEvent(`${WEEK[1]} 12:00:00`, `${addOneDay(WEEK[1])} 00:00:00`, {
      allDay: true,
      title: "PM",
    });
    const layout = gridWeekAllDayLayout([am, pm], WEEK);
    expect(layout.laneCount).toBe(0);
    expect(layout.hidden).toEqual([]);
  });

  it("excludes events outside the visible week", () => {
    const before = allDayOn(subOneDay(WEEK[0]), "Before");
    const after = allDayOn(addOneDay(WEEK[6]), "After");
    const layout = gridWeekAllDayLayout([before, after], WEEK);
    expect(layout.laneCount).toBe(0);
    expect(layout.hidden).toEqual([]);
  });
});
