import { describe, expect, it } from "vitest";

import type { CalendarEvent, CalendarEventPayload } from "@/lib/events/queries";
import { buildOverviewCounts, involvedUserIds } from "./counts";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const USER_C = "33333333-3333-3333-3333-333333333333";

function makeEvent(
  overrides: Partial<CalendarEventPayload>,
  id = "event-1",
): CalendarEvent {
  const payload: CalendarEventPayload = {
    calendarId: "cal-1",
    googleEventId: id,
    allDay: false,
    eventType: null,
    calendarName: "Ops",
    eventId: null,
    creatorId: null,
    inviteeUserIds: [],
    inviteeDepartmentIds: [],
    rawTitle: null,
    timeOption: "range",
    startAmPm: null,
    endAmPm: null,
    external: false,
    ...overrides,
  };
  return {
    id,
    title: "t",
    start: "2026-08-01 09:00:00",
    end: "2026-08-01 10:00:00",
    color: "blue",
    payload,
  };
}

describe("involvedUserIds", () => {
  it("returns the creator and tagged users, deduped", () => {
    const event = makeEvent({ creatorId: USER_A, inviteeUserIds: [USER_B, USER_A] });
    expect(involvedUserIds(event).sort()).toEqual([USER_A, USER_B]);
  });

  it("returns nothing for an event linked to no one", () => {
    expect(involvedUserIds(makeEvent({}))).toEqual([]);
  });
});

describe("buildOverviewCounts", () => {
  const typeNames = ["Meeting", "Interviews", "Out of Office"];

  it("counts events per user per type", () => {
    const events = [
      makeEvent({ eventType: "Meeting", creatorId: USER_A }, "e1"),
      makeEvent({ eventType: "Meeting", creatorId: USER_B }, "e2"),
      makeEvent({ eventType: "Out of Office", inviteeUserIds: [USER_A] }, "e3"),
      makeEvent({ eventType: "Interviews", creatorId: USER_B }, "e4"),
    ];
    const counts = buildOverviewCounts({
      events,
      userIds: [USER_A, USER_B],
      typeNames,
    });
    expect(counts.get(USER_A)).toEqual({ Meeting: 1, Interviews: 0, "Out of Office": 1 });
    expect(counts.get(USER_B)).toEqual({ Meeting: 1, Interviews: 1, "Out of Office": 0 });
  });

  it("counts a user once per event even when creator and invitee", () => {
    const events = [makeEvent({ eventType: "Meeting", creatorId: USER_A, inviteeUserIds: [USER_A] }, "e1")];
    const counts = buildOverviewCounts({ events, userIds: [USER_A], typeNames });
    expect(counts.get(USER_A)).toEqual({ Meeting: 1, Interviews: 0, "Out of Office": 0 });
  });

  it("counts an event for every tagged user", () => {
    const events = [makeEvent({ eventType: "Meeting", inviteeUserIds: [USER_A, USER_B] }, "e1")];
    const counts = buildOverviewCounts({
      events,
      userIds: [USER_A, USER_B, USER_C],
      typeNames,
    });
    expect(counts.get(USER_A)?.Meeting).toBe(1);
    expect(counts.get(USER_B)?.Meeting).toBe(1);
    expect(counts.get(USER_C)?.Meeting).toBe(0);
  });

  it("skips events without a parseable type", () => {
    const events = [makeEvent({ eventType: null, creatorId: USER_A }, "e1")];
    const counts = buildOverviewCounts({ events, userIds: [USER_A], typeNames });
    expect(counts.get(USER_A)).toEqual({ Meeting: 0, Interviews: 0, "Out of Office": 0 });
  });

  it("skips events whose type is not among the configured columns", () => {
    const events = [makeEvent({ eventType: "Parade", creatorId: USER_A }, "e1")];
    const counts = buildOverviewCounts({ events, userIds: [USER_A], typeNames });
    expect(counts.get(USER_A)).toEqual({ Meeting: 0, Interviews: 0, "Out of Office": 0 });
  });

  it("skips users not in the row set", () => {
    const events = [makeEvent({ eventType: "Meeting", creatorId: USER_C }, "e1")];
    const counts = buildOverviewCounts({ events, userIds: [USER_A], typeNames });
    expect(counts.get(USER_A)).toEqual({ Meeting: 0, Interviews: 0, "Out of Office": 0 });
    expect(counts.has(USER_C)).toBe(false);
  });

  it("accumulates multiple events of the same type", () => {
    const events = [
      makeEvent({ eventType: "Meeting", creatorId: USER_A }, "e1"),
      makeEvent({ eventType: "Meeting", creatorId: USER_A }, "e2"),
      makeEvent({ eventType: "Meeting", creatorId: USER_A }, "e3"),
    ];
    const counts = buildOverviewCounts({ events, userIds: [USER_A], typeNames });
    expect(counts.get(USER_A)?.Meeting).toBe(3);
  });
});
