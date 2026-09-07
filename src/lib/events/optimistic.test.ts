import { describe, expect, it } from "vitest";

import {
  applyOptimisticOps,
  buildOptimisticEvent,
  isOptimisticStandIn,
  optimisticRemove,
  optimisticUpsert,
  optimisticEventKey,
  type OptimisticRemoveOp,
} from "./optimistic";
import { effectiveCalendarColor, effectiveEventTypeColor } from "./eventColors";
import type { CalendarEvent } from "./queries";
import type { TimeOption } from "./timeOptions";
import type { EventFormValues } from "./validate";

interface BaseEventOverrides {
  eventId?: string | null;
  googleEventId?: string;
  calendarId?: string;
  calendarName?: string;
  timeOption?: TimeOption;
  allDay?: boolean;
  startAmPm?: "AM" | "PM" | null;
  endAmPm?: "AM" | "PM" | null;
}

function baseEvent(
  id: string,
  start: string,
  end: string,
  overrides: BaseEventOverrides = {},
): CalendarEvent {
  return {
    id,
    title: `Event ${id}`,
    start,
    end,
    color: "blue",
    payload: {
      calendarId: overrides.calendarId ?? "cal-1",
      googleEventId: overrides.googleEventId ?? id,
      allDay: overrides.allDay ?? false,
      eventType: null,
      calendarName: overrides.calendarName ?? "Dept A",
      eventId: overrides.eventId ?? null,
      creatorId: null,
      inviteeUserIds: [],
      inviteeDepartmentIds: [],
      rawTitle: null,
      timeOption: overrides.timeOption ?? "range",
      startAmPm: overrides.startAmPm ?? null,
      endAmPm: overrides.endAmPm ?? null,
      outOfCamp: false,
      overseas: false,
      pinned: false,
      ownerOnlyEdits: false,
      location: "",
      external: false,
    },
  };
}

function ids(events: CalendarEvent[]): string[] {
  return events.map((e) => e.id);
}

describe("applyOptimisticOps", () => {
  it("returns the base unchanged when there are no ops (same order)", () => {
    const base = [
      baseEvent("a", "2026-08-21 08:00:00", "2026-08-21 09:00:00"),
      baseEvent("b", "2026-08-21 10:00:00", "2026-08-21 11:00:00"),
    ];
    const out = applyOptimisticOps(base, []);
    expect(out).toEqual(base);
  });

  it("does not mutate the base array", () => {
    const base = [baseEvent("a", "2026-08-21 08:00:00", "2026-08-21 09:00:00")];
    const op = optimisticUpsert("op1", baseEvent("x", "2026-08-21 07:00:00", "2026-08-21 07:30:00"));
    applyOptimisticOps(base, [op]);
    expect(base.map((e) => e.id)).toEqual(["a"]);
  });

  it("adds a create at its chronological position, not the tail", () => {
    const base = [
      baseEvent("a", "2026-08-21 08:00:00", "2026-08-21 09:00:00"),
      baseEvent("b", "2026-08-21 10:00:00", "2026-08-21 11:00:00"),
    ];
    const standIn = baseEvent("new", "2026-08-21 09:30:00", "2026-08-21 09:45:00", {
      googleEventId: "",
      eventId: "placeholder-1",
    });
    const out = applyOptimisticOps(base, [optimisticUpsert("op1", standIn)]);
    expect(ids(out)).toEqual(["a", "new", "b"]);
  });

  it("replaces a grouped edit's base copy (one row, no duplicate)", () => {
    const base = [
      baseEvent("cal-1:g1", "2026-08-21 08:00:00", "2026-08-21 09:00:00", { eventId: "g1" }),
      baseEvent("cal-2:o", "2026-08-21 10:00:00", "2026-08-21 11:00:00", {
        eventId: "o",
        calendarId: "cal-2",
        calendarName: "Dept B",
      }),
    ];
    const edited = {
      ...baseEvent("cal-1:g1", "2026-08-21 08:00:00", "2026-08-21 10:00:00", { eventId: "g1" }),
      title: "Renamed",
    };
    const out = applyOptimisticOps(base, [optimisticUpsert("op1", edited)]);
    expect(out).toHaveLength(2);
    expect(ids(out)).toEqual(["cal-1:g1", "cal-2:o"]);
    expect(out.find((e) => e.payload.eventId === "g1")?.title).toBe("Renamed");
  });

  it("replaces a legacy (ungrouped) edit by exact copy identity", () => {
    const legacy = baseEvent("cal-1:legacy-google", "2026-08-21 08:00:00", "2026-08-21 09:00:00", {
      googleEventId: "legacy-google",
      eventId: null,
    });
    const base = [legacy];
    const edited = {
      ...legacy,
      title: "Legacy edited",
      end: "2026-08-21 11:00:00",
      payload: { ...legacy.payload, googleEventId: "legacy-google", eventId: null },
    };
    const out = applyOptimisticOps(base, [optimisticUpsert("op1", edited)]);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Legacy edited");
  });

  it("keeps an edit that does not collide (no base row) as an addition", () => {
    const base = [baseEvent("a", "2026-08-21 08:00:00", "2026-08-21 09:00:00")];
    const other = baseEvent("x", "2026-08-21 12:00:00", "2026-08-21 13:00:00", {
      googleEventId: "x",
      eventId: "gx",
    });
    const out = applyOptimisticOps(base, [optimisticUpsert("op1", other)]);
    expect(out).toHaveLength(2);
    expect(ids(out)).toEqual(["a", "x"]);
  });

  it("removes a grouped event by group id, leaving the rest", () => {
    const base = [
      baseEvent("cal-1:g1", "2026-08-21 08:00:00", "2026-08-21 09:00:00", { eventId: "g1" }),
      baseEvent("cal-2:o", "2026-08-21 10:00:00", "2026-08-21 11:00:00", {
        eventId: "o",
        calendarId: "cal-2",
      }),
    ];
    const op = optimisticRemove("op1", { calendarId: "cal-1", googleEventId: "g1", eventId: "g1" });
    const out = applyOptimisticOps(base, [op]);
    expect(ids(out)).toEqual(["cal-2:o"]);
  });

  it("removes a legacy event by exact copy, not by group", () => {
    const legacy = baseEvent("cal-1:lg", "2026-08-21 08:00:00", "2026-08-21 09:00:00", {
      googleEventId: "lg",
      eventId: null,
    });
    const base = [legacy];
    const op = optimisticRemove("op1", { calendarId: "cal-1", googleEventId: "lg", eventId: null });
    const out = applyOptimisticOps(base, [op]);
    expect(out).toEqual([]);
  });

  it("does not remove another copy that merely shares the same calendar", () => {
    const base = [
      baseEvent("cal-1:one", "2026-08-21 08:00:00", "2026-08-21 09:00:00", {
        googleEventId: "one",
        eventId: null,
      }),
      baseEvent("cal-1:two", "2026-08-21 10:00:00", "2026-08-21 11:00:00", {
        googleEventId: "two",
        eventId: null,
      }),
    ];
    const op = optimisticRemove("op1", { calendarId: "cal-1", googleEventId: "one", eventId: null });
    const out = applyOptimisticOps(base, [op]);
    expect(ids(out)).toEqual(["cal-1:two"]);
  });

  it("applies create + delete ops from different mutations together", () => {
    const base = [baseEvent("keep", "2026-08-21 08:00:00", "2026-08-21 09:00:00", { eventId: "keep" })];
    const toDelete = baseEvent("gone", "2026-08-21 10:00:00", "2026-08-21 11:00:00", {
      googleEventId: "gone",
      eventId: "gone",
    });
    const standIn = baseEvent("new", "2026-08-21 07:00:00", "2026-08-21 07:30:00", {
      googleEventId: "",
      eventId: "placeholder-2",
    });
    const ops = [
      optimisticRemove("del", { calendarId: "cal-1", googleEventId: "gone", eventId: "gone" }),
      optimisticUpsert("create", standIn),
    ];
    const baseWithGone = [base[0], toDelete];
    const out = applyOptimisticOps(baseWithGone, ops);
    expect(ids(out)).toEqual(["new", "keep"]);
  });

  it("is stable for events sharing a start time (input order preserved)", () => {
    const base = [
      baseEvent("a", "2026-08-21 09:00:00", "2026-08-21 10:00:00"),
      baseEvent("b", "2026-08-21 09:00:00", "2026-08-21 11:00:00"),
    ];
    const out = applyOptimisticOps(base, []);
    expect(ids(out)).toEqual(["a", "b"]);
  });
});

describe("optimisticRemove / optimisticUpsert factories", () => {
  it("creates unsettled ops carrying the right shape", () => {
    const event = baseEvent("cal-1:g", "2026-08-21 08:00:00", "2026-08-21 09:00:00", {
      eventId: "g",
    });
    const up = optimisticUpsert("op-up", event);
    expect(up.kind).toBe("upsert");
    expect(up.id).toBe("op-up");
    expect(up.settled).toBe(false);
    expect(up.event).toBe(event);

    const rm = optimisticRemove("op-rm", {
      calendarId: "cal-1",
      googleEventId: "g",
      eventId: "g",
    });
    expect(rm.kind).toBe("remove");
    expect(rm.settled).toBe(false);
    const expected: OptimisticRemoveOp = {
      kind: "remove",
      id: "op-rm",
      settled: false,
      calendarId: "cal-1",
      googleEventId: "g",
      eventId: "g",
    };
    expect(rm).toEqual(expected);
  });
});

describe("optimisticEventKey", () => {
  it("prefers the group id when present", () => {
    const grouped = baseEvent("cal-1:g", "2026-08-21 08:00:00", "2026-08-21 09:00:00", {
      eventId: "g",
    });
    expect(optimisticEventKey(grouped)).toBe("g");
  });

  it("falls back to the exact copy for legacy events", () => {
    const legacy = baseEvent("cal-1:lg", "2026-08-21 08:00:00", "2026-08-21 09:00:00", {
      googleEventId: "lg",
      eventId: null,
    });
    expect(optimisticEventKey(legacy)).toBe("cal-1:lg");
  });
});

describe("isOptimisticStandIn", () => {
  it("marks an event whose google id is not yet known", () => {
    const standIn = baseEvent("cal-1:p", "2026-08-21 08:00:00", "2026-08-21 09:00:00", {
      googleEventId: "",
      eventId: "p",
    });
    expect(isOptimisticStandIn(standIn)).toBe(true);
  });

  it("is false for a real (server-fetched) event", () => {
    const real = baseEvent("cal-1:g", "2026-08-21 08:00:00", "2026-08-21 09:00:00", {
      googleEventId: "g-123",
      eventId: "g",
    });
    expect(isOptimisticStandIn(real)).toBe(false);
  });

  it("is false for null/undefined payloads", () => {
    expect(isOptimisticStandIn(null)).toBe(false);
    expect(isOptimisticStandIn(undefined)).toBe(false);
  });
});

function formValues(overrides: Partial<EventFormValues> = {}): EventFormValues {
  return {
    title: "Patrol A",
    timeOption: "range",
    startAmPm: "AM",
    endAmPm: "PM",
    start: "2026-08-21 09:00:00",
    end: "2026-08-21 11:00:00",
    eventType: "Drill",
    creatorId: "",
    inviteeUserIds: [],
    inviteeDepartments: [],
    ownerOnlyEdits: false,
    outOfCamp: false,
    overseas: false,
    pinned: false,
    location: "",
    ...overrides,
  };
}

describe("buildOptimisticEvent", () => {
  const identity = {
    calendarId: "cal-1",
    calendarName: "Dept A",
    googleEventId: "",
    eventId: "placeholder-1",
  };

  it("defaults a blank creator to the acting user without auto-inviting them", () => {
    const event = buildOptimisticEvent({
      identity,
      values: formValues(),
      actingUserId: "user-7",
      title: "Patrol A",
      eventTypeColor: null,
    });
    expect(event.payload.creatorId).toBe("user-7");
    expect(event.payload.inviteeUserIds).toEqual([]);
    expect(event.payload.external).toBe(false);
  });

  it("clamps an inverted end to start (mirroring the server safety net)", () => {
    const event = buildOptimisticEvent({
      identity,
      values: formValues({ start: "2026-08-21 15:00:00", end: "2026-08-21 09:00:00" }),
      actingUserId: "user-7",
      title: "Patrol A",
      eventTypeColor: null,
    });
    expect(event.end).toBe("2026-08-21 15:00:00");
  });

  it("keeps timed events' naive wall-clock start/end", () => {
    const event = buildOptimisticEvent({
      identity,
      values: formValues(),
      actingUserId: "user-7",
      title: "Patrol A",
      eventTypeColor: null,
    });
    expect(event.start).toBe("2026-08-21 09:00:00");
    expect(event.end).toBe("2026-08-21 11:00:00");
    expect(event.payload.allDay).toBe(false);
    expect(event.payload.timeOption).toBe("range");
  });

  it("maps a full-day event to midnight values with an exclusive next-day end", () => {
    const event = buildOptimisticEvent({
      identity,
      values: formValues({
        timeOption: "full",
        start: "2026-08-21 00:00:00",
        end: "2026-08-21 00:00:00",
      }),
      actingUserId: "user-7",
      title: "Day off",
      eventTypeColor: null,
    });
    expect(event.payload.allDay).toBe(true);
    expect(event.start).toBe("2026-08-21 00:00:00");
    // Inclusive last day stored by the form → exclusive end (day after).
    expect(event.end).toBe("2026-08-22 00:00:00");
  });

  it("carries half-day markers only for half events", () => {
    const half = buildOptimisticEvent({
      identity,
      values: formValues({
        timeOption: "half",
        start: "2026-08-21 00:00:00",
        end: "2026-08-22 00:00:00",
        startAmPm: "AM",
        endAmPm: "PM",
      }),
      actingUserId: "user-7",
      title: "Half",
      eventTypeColor: null,
    });
    expect(half.payload.allDay).toBe(true);
    expect(half.payload.startAmPm).toBe("AM");
    expect(half.payload.endAmPm).toBe("PM");
  });

  it("uses the type's pinned color when set", () => {
    const event = buildOptimisticEvent({
      identity,
      values: formValues(),
      actingUserId: "user-7",
      title: "Patrol A",
      eventTypeColor: "red",
    });
    expect(event.color).toBe(effectiveEventTypeColor("Drill", "red"));
    expect(event.color).toBe("red");
  });

  it("falls back to the deterministic type color when unpinned", () => {
    const event = buildOptimisticEvent({
      identity,
      values: formValues(),
      actingUserId: "user-7",
      title: "Patrol A",
      eventTypeColor: null,
    });
    expect(event.color).toBe(effectiveEventTypeColor("Drill", null));
  });

  it("falls back to the department color for untyped events", () => {
    const event = buildOptimisticEvent({
      identity,
      values: formValues({ eventType: "" }),
      actingUserId: "user-7",
      title: "Patrol A",
      eventTypeColor: null,
    });
    expect(event.payload.eventType).toBeNull();
    expect(event.color).toBe(effectiveCalendarColor("cal-1", null));
  });

  it("renders the given title first, then raw title, then a placeholder", () => {
    const withTitle = buildOptimisticEvent({
      identity,
      values: formValues(),
      actingUserId: "user-7",
      title: "   ",
      eventTypeColor: null,
    });
    expect(withTitle.title).toBe("Patrol A");

    const rawTitleBlank = buildOptimisticEvent({
      identity,
      values: formValues({ title: "" }),
      actingUserId: "user-7",
      title: "",
      eventTypeColor: null,
    });
    expect(rawTitleBlank.title).toBe("(no title)");
  });

  it("builds a stable, keyed id and propagates flags/location/rawTitle", () => {
    const event = buildOptimisticEvent({
      identity,
      values: formValues({
        outOfCamp: true,
        overseas: true,
        pinned: true,
        location: "Beach 2",
      }),
      actingUserId: "user-7",
      title: "Field trip",
      eventTypeColor: null,
    });
    expect(event.id).toBe("cal-1:placeholder-1");
    expect(event.payload.rawTitle).toBe("Patrol A");
    expect(event.payload.outOfCamp).toBe(true);
    expect(event.payload.overseas).toBe(true);
    expect(event.payload.pinned).toBe(true);
    expect(event.payload.location).toBe("Beach 2");
    expect(event.payload.calendarName).toBe("Dept A");
    expect(isOptimisticStandIn(event)).toBe(true);
  });

  it("keeps a real google id when the identity knows it (edits)", () => {
    const event = buildOptimisticEvent({
      identity: { ...identity, googleEventId: "g-123", eventId: "g" },
      values: formValues(),
      actingUserId: "user-7",
      title: "Patrol A",
      eventTypeColor: null,
    });
    expect(event.payload.googleEventId).toBe("g-123");
    expect(event.payload.eventId).toBe("g");
    expect(event.id).toBe("cal-1:g");
    expect(isOptimisticStandIn(event)).toBe(false);
  });
});
