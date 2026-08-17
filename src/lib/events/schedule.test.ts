import { describe, expect, it } from "vitest";

import type { CalendarEvent } from "./queries";
import {
  buildScheduleResources,
  departmentRowId,
  expandScheduleEvents,
  isDepartmentRowId,
  rowsForEvent,
} from "./schedule";

function makeEvent(overrides: Partial<CalendarEvent["payload"]> = {}): CalendarEvent {
  const payload: CalendarEvent["payload"] = {
    calendarId: "cal-1",
    googleEventId: "google-1",
    allDay: false,
    eventType: null,
    calendarName: "Dept A",
    eventId: overrides.eventId ?? null,
    creatorId: overrides.creatorId ?? null,
    inviteeUserIds: overrides.inviteeUserIds ?? [],
    inviteeDepartmentIds: overrides.inviteeDepartmentIds ?? [],
    rawTitle: null,
  };
  return { id: "cal-1:google-1", title: "Test event", start: "2026-08-17 09:00:00", end: "2026-08-17 10:00:00", color: "blue", payload };
}

describe("departmentRowId / isDepartmentRowId", () => {
  it("round-trips a department row id", () => {
    const rowId = departmentRowId("cal-9");
    expect(rowId).toBe("dept:cal-9");
    expect(isDepartmentRowId(rowId)).toBe(true);
    expect(isDepartmentRowId("user-1")).toBe(false);
  });
});

describe("rowsForEvent", () => {
  it("returns only the creator row when no one is tagged", () => {
    expect(rowsForEvent({ creatorId: "u1", userIds: [], departmentIds: [] })).toEqual(["u1"]);
  });

  it("combines creator, users, and departments", () => {
    expect(
      rowsForEvent({ creatorId: "u1", userIds: ["u2"], departmentIds: ["cal-9"] }),
    ).toEqual(["u1", "u2", "dept:cal-9"]);
  });

  it("dedupes when the creator is also tagged", () => {
    expect(
      rowsForEvent({ creatorId: "u1", userIds: ["u1", "u2"], departmentIds: ["cal-9", "cal-9"] }),
    ).toEqual(["u1", "u2", "dept:cal-9"]);
  });

  it("returns nothing when no one is linked", () => {
    expect(rowsForEvent({ creatorId: null, userIds: [], departmentIds: [] })).toEqual([]);
  });
});

describe("expandScheduleEvents", () => {
  it("expands one event per row with unique ids", () => {
    const expanded = expandScheduleEvents([
      makeEvent({ creatorId: "u1", inviteeUserIds: ["u2"], inviteeDepartmentIds: ["cal-9"] }),
    ]);
    expect(expanded).toHaveLength(3);
    expect(expanded.map((event) => event.resourceId)).toEqual(["u1", "u2", "dept:cal-9"]);
    expect(expanded[0].id).toBe("cal-1:google-1::u1");
    expect(new Set(expanded.map((event) => event.id)).size).toBe(3);
  });

  it("drops events linked to no one", () => {
    expect(expandScheduleEvents([makeEvent()])).toEqual([]);
  });
});

describe("buildScheduleResources", () => {
  const depts = [
    { id: "cal-1", name: "Dept A" },
    { id: "cal-2", name: "Dept B" },
  ];

  it("builds a department row plus user rows for a single department, no groups", () => {
    const { resources, groups } = buildScheduleResources({
      departments: [depts[0]],
      users: [
        { id: "u1", name: "Alice", shortname: null, departmentId: "cal-1" },
        { id: "u2", name: "Bob", shortname: null, departmentId: "cal-1" },
      ],
      events: [],
    });
    expect(groups).toBeUndefined();
    expect(resources.map((r) => r.id)).toEqual(["dept:cal-1", "u1", "u2"]);
  });

  it("drops empty departments that no event tags", () => {
    const { resources } = buildScheduleResources({
      departments: depts,
      users: [{ id: "u1", name: "Alice", shortname: null, departmentId: "cal-1" }],
      events: [],
    });
    expect(resources.map((r) => r.id)).toEqual(["dept:cal-1", "u1"]);
  });

  it("labels user rows with the shortname, falling back to the name", () => {
    const { resources } = buildScheduleResources({
      departments: [depts[0]],
      users: [
        { id: "u1", name: "Alice Tan", shortname: "AT", departmentId: "cal-1" },
        { id: "u2", name: "Bob Lee", shortname: null, departmentId: "cal-1" },
        { id: "u3", name: "Cara Ng", shortname: "", departmentId: "cal-1" },
      ],
      events: [],
    });
    expect(resources.map((r) => [r.label, r.fullName])).toEqual([
      ["Dept A", "Dept A"],
      ["AT", "Alice Tan"],
      ["Bob Lee", "Bob Lee"],
      ["Cara Ng", "Cara Ng"],
    ]);
  });

  it("emits groups when more than one department is shown", () => {
    const { resources, groups } = buildScheduleResources({
      departments: depts,
      users: [
        { id: "u1", name: "Alice", shortname: null, departmentId: "cal-1" },
        { id: "u2", name: "Bob", shortname: null, departmentId: "cal-2" },
      ],
      events: [],
    });
    expect(groups).toEqual([
      { label: "Dept A", resourceIds: ["dept:cal-1", "u1"] },
      { label: "Dept B", resourceIds: ["dept:cal-2", "u2"] },
    ]);
    expect(resources.map((r) => r.id)).toEqual(["dept:cal-1", "u1", "dept:cal-2", "u2"]);
  });

  it("keeps a department row when an event tags it despite no users", () => {
    const { resources } = buildScheduleResources({
      departments: depts,
      users: [],
      events: [makeEvent({ inviteeDepartmentIds: ["cal-2"] })],
    });
    expect(resources.map((r) => r.id)).toEqual(["dept:cal-2"]);
  });

  it("sorts users by name within each department, not by shortname", () => {
    const { resources } = buildScheduleResources({
      departments: depts,
      users: [
        // Shortnames are reverse of name order: sorting by shortname would put Bob first.
        { id: "u2", name: "Bob", shortname: "AA", departmentId: "cal-1" },
        { id: "u1", name: "Alice", shortname: "ZZ", departmentId: "cal-1" },
      ],
      events: [],
    });
    expect(resources.slice(1).map((r) => r.id)).toEqual(["u1", "u2"]);
  });
});
