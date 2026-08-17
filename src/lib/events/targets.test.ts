import { describe, expect, it } from "vitest";

import type { CalendarEvent } from "./queries";
import {
  dedupeEventsByGroupId,
  deriveTargetCalendarIds,
  diffEventTargets,
  eventRefFromCalendarEvent,
} from "./targets";

describe("deriveTargetCalendarIds", () => {
  it("unions creator, invited users' departments, and tagged departments", () => {
    expect(
      deriveTargetCalendarIds({
        creatorDepartmentId: "cal-a",
        invitedUserDepartmentIds: ["cal-b", "cal-a"],
        invitedDepartmentIds: ["cal-c"],
      }),
    ).toEqual(["cal-a", "cal-b", "cal-c"]);
  });

  it("drops nulls and dedupes", () => {
    expect(
      deriveTargetCalendarIds({
        creatorDepartmentId: null,
        invitedUserDepartmentIds: [null, "cal-b", "cal-b"],
        invitedDepartmentIds: ["cal-b"],
      }),
    ).toEqual(["cal-b"]);
  });

  it("returns empty when nothing is derivable", () => {
    expect(
      deriveTargetCalendarIds({
        creatorDepartmentId: null,
        invitedUserDepartmentIds: [null],
        invitedDepartmentIds: [],
      }),
    ).toEqual([]);
  });
});

describe("diffEventTargets", () => {
  it("splits create/keep/remove", () => {
    expect(diffEventTargets(["cal-a", "cal-b"], ["cal-b", "cal-c"])).toEqual({
      create: ["cal-c"],
      keep: ["cal-b"],
      remove: ["cal-a"],
    });
  });

  it("handles empty sides", () => {
    expect(diffEventTargets([], ["cal-a"])).toEqual({
      create: ["cal-a"],
      keep: [],
      remove: [],
    });
    expect(diffEventTargets(["cal-a"], [])).toEqual({
      create: [],
      keep: [],
      remove: ["cal-a"],
    });
  });
});

function makeEvent(eventId: string | null, calendarId = "cal-1"): CalendarEvent {
  return {
    id: `${calendarId}:google-${eventId ?? "legacy"}`,
    title: "Event",
    start: "2026-08-17 09:00:00",
    end: "2026-08-17 10:00:00",
    color: "blue",
    payload: {
      calendarId,
      googleEventId: `google-${eventId ?? "legacy"}`,
      allDay: false,
      eventType: null,
      calendarName: "Dept A",
      eventId,
      creatorId: "u1",
      inviteeUserIds: [],
      inviteeDepartmentIds: [],
    },
  };
}

describe("dedupeEventsByGroupId", () => {
  it("keeps the first copy per group id", () => {
    const events = [makeEvent("g1", "cal-a"), makeEvent("g1", "cal-b"), makeEvent("g2", "cal-a")];
    const deduped = dedupeEventsByGroupId(events);
    expect(deduped.map((e) => e.payload.googleEventId)).toEqual([
      "google-g1",
      "google-g2",
    ]);
    expect(deduped[0].payload.calendarId).toBe("cal-a");
  });

  it("keeps legacy events without a group id", () => {
    const events = [makeEvent(null), makeEvent(null, "cal-b")];
    expect(dedupeEventsByGroupId(events)).toHaveLength(2);
  });
});

describe("eventRefFromCalendarEvent", () => {
  it("maps the representative copy to an EventRef", () => {
    const event = makeEvent("group-1");
    const ref = eventRefFromCalendarEvent({
      ...event,
      payload: {
        ...event.payload,
        creatorId: "u9",
        inviteeUserIds: ["u2"],
        inviteeDepartmentIds: ["cal-9"],
      },
    });
    expect(ref).toEqual({
      calendarId: "cal-1",
      googleEventId: "google-group-1",
      eventId: "group-1",
      start: "2026-08-17 09:00:00",
      end: "2026-08-17 10:00:00",
      allDay: false,
      creatorId: "u9",
      inviteeUserIds: ["u2"],
      inviteeDepartmentIds: ["cal-9"],
    });
  });

  it("carries a null group id for legacy events", () => {
    expect(eventRefFromCalendarEvent(makeEvent(null)).eventId).toBeNull();
  });
});
