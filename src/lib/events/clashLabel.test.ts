import { describe, expect, it } from "vitest";

import type { ClashEventInput } from "./clashes";
import { clashLabelFor, type ClashLabelContext } from "./clashLabel";

function makeEvent(overrides: Partial<ClashEventInput> = {}): ClashEventInput {
  return {
    calendarId: "cal-1",
    googleEventId: "g-1",
    eventId: null,
    calendarName: "Ops",
    title: "Stored summary",
    start: new Date("2026-09-15T01:00:00Z"),
    end: new Date("2026-09-15T02:00:00Z"),
    allDay: false,
    external: false,
    timeOption: "range",
    startAmPm: null,
    endAmPm: null,
    typeName: "Meeting",
    typeShortname: "M",
    rawTitle: "Business discussion",
    people: { creatorId: null, userIds: ["u1", "u2"], departmentIds: ["cal-2"] },
    location: "Room 1",
    ...overrides,
  };
}

const ctx: ClashLabelContext = {
  nameTemplate: "{name} ({department})",
  usersById: new Map([
    ["u1", { name: "Wong WK", shortname: "WK", departmentName: "CG" }],
    ["u2", { name: "Ravi", shortname: null, departmentName: "CCG" }],
  ]),
  calendarNames: new Map([["cal-2", "CCG"]]),
};

describe("clashLabelFor", () => {
  it("renders the description with the default recipe", () => {
    expect(clashLabelFor(makeEvent(), { segments: [{ field: "description" }] }, ctx)).toBe(
      "Business discussion",
    );
  });

  it("renders type acronym + description", () => {
    expect(
      clashLabelFor(
        makeEvent(),
        {
          segments: [
            { field: "type", typeStyle: "acronym", connector: "middot" },
            { field: "description" },
          ],
        },
        ctx,
      ),
    ).toBe("M · Business discussion");
  });

  it("renders people and departments", () => {
    expect(
      clashLabelFor(
        makeEvent(),
        { segments: [{ field: "people", peopleStyle: "acronym" }] },
        ctx,
      ),
    ).toBe("WK, Ravi");
    expect(
      clashLabelFor(makeEvent(), { segments: [{ field: "departments" }] }, ctx),
    ).toBe("CCG");
  });

  it("renders location and wall-clock time", () => {
    expect(
      clashLabelFor(
        makeEvent(),
        {
          segments: [
            { field: "location", connector: "middot" },
            { field: "time", wrapper: "paren" },
          ],
        },
        ctx,
      ),
    ).toBe("Room 1 · (09:00-10:00)");
  });

  it("falls back to the raw title, then the stored summary, when nothing renders", () => {
    expect(
      clashLabelFor(makeEvent({ rawTitle: "" }), { segments: [{ field: "description" }] }, ctx),
    ).toBe("Stored summary");
    expect(
      clashLabelFor(
        makeEvent({ rawTitle: "", typeName: null, typeShortname: null }),
        { segments: [{ field: "type", typeStyle: "acronym" }] },
        ctx,
      ),
    ).toBe("Stored summary");
  });
});
