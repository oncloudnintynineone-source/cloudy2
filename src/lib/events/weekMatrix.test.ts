import { describe, expect, it } from "vitest";

import { addOneDay, subOneDay, weekDays } from "./datetime";
import type { CalendarEvent } from "./queries";
import { buildWeekMatrix, coveredDays } from "./weekMatrix";

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

describe("coveredDays", () => {
  it("keeps a same-day timed event on its day", () => {
    const event = makeEvent(`${WEEK[2]} 09:00:00`, `${WEEK[2]} 11:30:00`);
    expect(coveredDays(event, WEEK)).toEqual([WEEK[2]]);
  });

  it("treats all-day ends as exclusive (one-day event stays on one day)", () => {
    const event = makeEvent(`${WEEK[0]} 00:00:00`, `${WEEK[1]} 00:00:00`, { allDay: true });
    expect(coveredDays(event, WEEK)).toEqual([WEEK[0]]);
  });

  it("spans a multi-day all-day event across its days", () => {
    // Monday through Wednesday: exclusive end is Thursday.
    const event = makeEvent(`${WEEK[0]} 00:00:00`, `${WEEK[3]} 00:00:00`, { allDay: true });
    expect(coveredDays(event, WEEK)).toEqual([WEEK[0], WEEK[1], WEEK[2]]);
  });

  it("spans a timed event crossing midnight onto both days", () => {
    const event = makeEvent(`${WEEK[1]} 22:00:00`, `${WEEK[2]} 02:00:00`);
    expect(coveredDays(event, WEEK)).toEqual([WEEK[1], WEEK[2]]);
  });

  it("clamps an event that starts before the week", () => {
    const event = makeEvent(`${subOneDay(WEEK[0])} 09:00:00`, `${WEEK[1]} 10:00:00`);
    expect(coveredDays(event, WEEK)).toEqual([WEEK[0], WEEK[1]]);
  });

  it("clamps an event that ends after the week", () => {
    // Two-day all-day starting the Saturday day: exclusive end is Monday.
    const event = makeEvent(`${WEEK[5]} 00:00:00`, `${addOneDay(WEEK[6])} 00:00:00`, {
      allDay: true,
    });
    expect(coveredDays(event, WEEK)).toEqual([WEEK[5], WEEK[6]]);
  });

  it("returns nothing for an event outside the week", () => {
    const event = makeEvent(`${subOneDay(WEEK[0])} 09:00:00`, `${subOneDay(WEEK[0])} 23:59:59`);
    expect(coveredDays(event, WEEK)).toEqual([]);
  });
});

describe("buildWeekMatrix", () => {
  it("bins a creator-only event into the creator's row and day", () => {
    const matrix = buildWeekMatrix(
      [makeEvent(`${WEEK[2]} 09:00:00`, `${WEEK[2]} 10:00:00`, { creatorId: "u1" })],
      WEEK,
    );
    expect([...matrix.keys()]).toEqual(["u1"]);
    const byDay = matrix.get("u1")!;
    expect([...byDay.keys()]).toEqual([WEEK[2]]);
    expect(byDay.get(WEEK[2])).toHaveLength(1);
  });

  it("places the event in every tagged user and department row", () => {
    const matrix = buildWeekMatrix(
      [
        makeEvent(`${WEEK[1]} 09:00:00`, `${WEEK[1]} 10:00:00`, {
          creatorId: "u1",
          inviteeUserIds: ["u2"],
          inviteeDepartmentIds: ["cal-9"],
        }),
      ],
      WEEK,
    );
    expect([...matrix.keys()]).toEqual(["u1", "u2", "dept:cal-9"]);
    for (const rowId of ["u1", "u2", "dept:cal-9"]) {
      expect(matrix.get(rowId)!.get(WEEK[1])).toHaveLength(1);
    }
  });

  it("pins an external event with no rows to its calendar's department row", () => {
    const matrix = buildWeekMatrix(
      [makeEvent(`${WEEK[3]} 09:00:00`, `${WEEK[3]} 10:00:00`, { external: true })],
      WEEK,
    );
    expect([...matrix.keys()]).toEqual(["dept:cal-1"]);
    expect(matrix.get("dept:cal-1")!.get(WEEK[3])!).toHaveLength(1);
  });

  it("drops an unlinked non-external event entirely", () => {
    const matrix = buildWeekMatrix([makeEvent(`${WEEK[3]} 09:00:00`, `${WEEK[3]} 10:00:00`)], WEEK);
    expect(matrix.size).toBe(0);
  });

  it("omits rows for events outside the week", () => {
    const matrix = buildWeekMatrix(
      [
        makeEvent(`${subOneDay(WEEK[0])} 09:00:00`, `${subOneDay(WEEK[0])} 10:00:00`, {
          creatorId: "u1",
        }),
      ],
      WEEK,
    );
    expect(matrix.size).toBe(0);
  });

  it("copies a multi-day all-day event into every covered cell of a row", () => {
    const matrix = buildWeekMatrix(
      [makeEvent(`${WEEK[0]} 00:00:00`, `${WEEK[3]} 00:00:00`, { allDay: true, creatorId: "u1" })],
      WEEK,
    );
    const byDay = matrix.get("u1")!;
    expect([...byDay.keys()]).toEqual([WEEK[0], WEEK[1], WEEK[2]]);
  });

  it("sorts a cell by start time, breaking ties by title", () => {
    const withCreator = (event: CalendarEvent): CalendarEvent => ({
      ...event,
      payload: { ...event.payload, creatorId: "u1" },
    });
    const later = makeEvent(`${WEEK[4]} 15:00:00`, `${WEEK[4]} 16:00:00`, { title: "Zulu" });
    const earlier = makeEvent(`${WEEK[4]} 08:00:00`, `${WEEK[4]} 09:00:00`, { title: "Alpha" });
    const sameTimeB = makeEvent(`${WEEK[4]} 10:00:00`, `${WEEK[4]} 10:30:00`, { title: "Bravo" });
    const sameTimeA = makeEvent(`${WEEK[4]} 10:00:00`, `${WEEK[4]} 11:00:00`, { title: "Alpha" });
    const matrix = buildWeekMatrix([later, earlier, sameTimeB, sameTimeA].map(withCreator), WEEK);
    const titles = (matrix.get("u1")!.get(WEEK[4]) ?? []).map((event) => event.title);
    expect(titles).toEqual(["Alpha", "Alpha", "Bravo", "Zulu"]);
  });
});
