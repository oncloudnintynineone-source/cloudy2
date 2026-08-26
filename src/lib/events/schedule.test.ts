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
    timeOption: overrides.timeOption ?? "range",
    startAmPm: overrides.startAmPm ?? null,
    endAmPm: overrides.endAmPm ?? null,
    outOfCamp: overrides.outOfCamp ?? false,
    location: overrides.location ?? "",
    external: overrides.external ?? false,
  };
  return {
    id: "cal-1:google-1",
    title: "Test event",
    start: "2026-08-17 09:00:00",
    end: "2026-08-17 10:00:00",
    color: "blue",
    payload,
  };
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
    expect(rowsForEvent({ creatorId: "u1", userIds: ["u2"], departmentIds: ["cal-9"] })).toEqual([
      "u1",
      "u2",
      "dept:cal-9",
    ]);
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

  it("pins an external event with no people to its calendar's department row", () => {
    const expanded = expandScheduleEvents([makeEvent({ external: true })]);
    expect(expanded).toHaveLength(1);
    expect(expanded[0].resourceId).toBe("dept:cal-1");
    expect(expanded[0].id).toBe("cal-1:google-1::dept:cal-1");
  });

  it("keeps an external event's people rows when it has any", () => {
    const expanded = expandScheduleEvents([
      makeEvent({ external: true, creatorId: "u1", inviteeUserIds: ["u2"] }),
    ]);
    expect(expanded.map((event) => event.resourceId)).toEqual(["u1", "u2"]);
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

  it("keeps a department row when an external event lives there despite no users", () => {
    const { resources } = buildScheduleResources({
      departments: depts,
      users: [],
      events: [makeEvent({ external: true })],
    });
    expect(resources.map((r) => r.id)).toEqual(["dept:cal-1"]);
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

describe("buildScheduleResources with a user filter", () => {
  const depts = [
    { id: "cal-1", name: "Dept A" },
    { id: "cal-2", name: "Dept B" },
  ];
  const users = [
    { id: "u1", name: "Alice", shortname: null, departmentId: "cal-1" },
    { id: "u2", name: "Bob", shortname: "BL", departmentId: "cal-1" },
    { id: "u3", name: "Cara", shortname: null, departmentId: "cal-2" },
    { id: "u4", name: "Dan", shortname: null, departmentId: null },
  ];

  it("renders only the selected user's row — no department row, no other users", () => {
    const { resources, groups } = buildScheduleResources({
      departments: depts,
      users,
      events: [],
      userFilter: ["u2"],
    });
    expect(groups).toBeUndefined();
    expect(resources.map((r) => r.id)).toEqual(["u2"]);
    expect(resources[0].label).toBe("BL");
  });

  it("drops department rows even when events tag the department", () => {
    const { resources } = buildScheduleResources({
      departments: depts,
      users,
      events: [
        makeEvent({ creatorId: "u1", inviteeUserIds: ["u3"], inviteeDepartmentIds: ["cal-1"] }),
        makeEvent({ external: true }),
      ],
      userFilter: ["u1", "u3"],
    });
    expect(resources.map((r) => r.id)).toEqual(["u1", "u3"]);
    expect(resources.every((r) => !r.isDepartment)).toBe(true);
  });

  it("groups selected users under their own departments with group labels", () => {
    const { resources, groups } = buildScheduleResources({
      departments: depts,
      users,
      events: [],
      userFilter: ["u3", "u1"],
    });
    expect(groups).toEqual([
      { label: "Dept A", resourceIds: ["u1"] },
      { label: "Dept B", resourceIds: ["u3"] },
    ]);
    expect(resources.map((r) => r.id)).toEqual(["u1", "u3"]);
  });

  it("skips selected users missing from the roster", () => {
    const { resources } = buildScheduleResources({
      departments: depts,
      users,
      events: [],
      userFilter: ["ghost", "u1"],
    });
    expect(resources.map((r) => r.id)).toEqual(["u1"]);
  });

  it("puts unassigned selected users in a trailing Unassigned group", () => {
    const { resources, groups } = buildScheduleResources({
      departments: depts,
      users,
      events: [],
      userFilter: ["u4", "u1"],
    });
    expect(groups).toEqual([
      { label: "Dept A", resourceIds: ["u1"] },
      { label: "Unassigned", resourceIds: ["u4"] },
    ]);
    expect(resources.map((r) => r.id)).toEqual(["u1", "u4"]);
  });

  it("returns no rows when no selected user is in the roster", () => {
    const { resources, groups } = buildScheduleResources({
      departments: depts,
      users,
      events: [],
      userFilter: ["ghost"],
    });
    expect(resources).toEqual([]);
    expect(groups).toBeUndefined();
  });
});
