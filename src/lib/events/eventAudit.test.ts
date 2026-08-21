import { describe, expect, it } from "vitest";

import type { GcalEventItem } from "@/lib/google";

import {
  buildEventSnapshot,
  formatEventAuditTime,
  snapshotFromCopy,
  type EventSnapshotNames,
} from "./eventAudit";
import { renderEventTitle } from "./eventTitle";
import {
  encodeEventNotes,
  encodeNotesBlock,
  withEditLink,
  withInternalMarker,
  type EventNotes,
} from "./notes";
import type { EventRef } from "./targets";

describe("formatEventAuditTime", () => {
  it("renders a same-day range event", () => {
    expect(
      formatEventAuditTime({
        timeOption: "range",
        start: "2026-08-21 14:00:00",
        end: "2026-08-21 15:30:00",
        startAmPm: "",
        endAmPm: "",
      }),
    ).toBe("2026-08-21 14:00 \u2013 15:30");
  });

  it("keeps non-zero seconds", () => {
    expect(
      formatEventAuditTime({
        timeOption: "range",
        start: "2026-08-21 14:00:30",
        end: "2026-08-21 15:30:00",
        startAmPm: "",
        endAmPm: "",
      }),
    ).toBe("2026-08-21 14:00:30 \u2013 15:30");
  });

  it("renders a multi-day range event with both dates", () => {
    expect(
      formatEventAuditTime({
        timeOption: "range",
        start: "2026-08-21 14:00:00",
        end: "2026-08-23 09:30:00",
        startAmPm: "",
        endAmPm: "",
      }),
    ).toBe("2026-08-21 14:00 \u2013 2026-08-23 09:30");
  });

  it("renders a full-day event with a shared AM/PM marker", () => {
    expect(
      formatEventAuditTime({
        timeOption: "full",
        start: "2026-08-21 00:00:00",
        end: "2026-08-21 00:00:00",
        startAmPm: "AM",
        endAmPm: "AM",
      }),
    ).toBe("2026-08-21 (AM)");
  });

  it("renders a single full day spanning AM to PM", () => {
    expect(
      formatEventAuditTime({
        timeOption: "full",
        start: "2026-08-21 00:00:00",
        end: "2026-08-21 00:00:00",
        startAmPm: "AM",
        endAmPm: "PM",
      }),
    ).toBe("2026-08-21 (AM\u2013PM)");
  });

  it("renders a full-day event without markers as bare dates", () => {
    expect(
      formatEventAuditTime({
        timeOption: "full",
        start: "2026-08-21 00:00:00",
        end: "2026-08-23 00:00:00",
        startAmPm: "",
        endAmPm: "",
      }),
    ).toBe("2026-08-21 \u2013 2026-08-23");
  });

  it("renders a multi-day full event with per-side markers", () => {
    expect(
      formatEventAuditTime({
        timeOption: "full",
        start: "2026-08-21 00:00:00",
        end: "2026-08-23 00:00:00",
        startAmPm: "AM",
        endAmPm: "PM",
      }),
    ).toBe("2026-08-21 (AM) \u2013 2026-08-23 (PM)");
  });
});

describe("buildEventSnapshot", () => {
  const names: EventSnapshotNames = {
    departmentNames: { "d-1": "COU", "d-2": "LOG" },
    userNames: { "u-1": "Tan Wei Liang", "u-2": "Lim Kah" },
  };

  it("resolves departments and invitees to names", () => {
    const snapshot = buildEventSnapshot({
      title: "OUT Tan Wei Liang",
      description: "Trip to Singapore",
      type: "Out of Camp",
      timeParts: {
        timeOption: "range",
        start: "2026-08-21 14:00:00",
        end: "2026-08-21 15:30:00",
        startAmPm: "",
        endAmPm: "",
      },
      outOfCamp: true,
      location: "Singapore",
      departmentIds: ["d-1", "d-2"],
      inviteeUserIds: ["u-1", "u-2", "u-1"],
      creatorId: "u-1",
      names,
    });
    expect(snapshot).toEqual({
      title: "OUT Tan Wei Liang",
      description: "Trip to Singapore",
      type: "Out of Camp",
      time: "2026-08-21 14:00 \u2013 15:30",
      outOfCamp: true,
      location: "Singapore",
      departments: ["COU", "LOG"],
      invitees: ["Tan Wei Liang", "Lim Kah"],
      creator: "Tan Wei Liang",
    });
  });

  it("turns blank title, description, type, and location into null and drops unknown ids", () => {
    const snapshot = buildEventSnapshot({
      title: "   ",
      description: "",
      type: "",
      timeParts: {
        timeOption: "full",
        start: "2026-08-21 00:00:00",
        end: "2026-08-21 00:00:00",
        startAmPm: "PM",
        endAmPm: "PM",
      },
      outOfCamp: false,
      location: "  ",
      departmentIds: ["d-1", "unknown"],
      inviteeUserIds: ["unknown"],
      creatorId: null,
      names,
    });
    expect(snapshot.title).toBeNull();
    expect(snapshot.description).toBeNull();
    expect(snapshot.type).toBeNull();
    expect(snapshot.location).toBeNull();
    expect(snapshot.outOfCamp).toBe(false);
    expect(snapshot.time).toBe("2026-08-21 (PM)");
    expect(snapshot.departments).toEqual(["COU"]);
    expect(snapshot.invitees).toEqual([]);
    expect(snapshot.creator).toBeNull();
  });
});

function v3Description(notes: EventNotes): string {
  const block = encodeNotesBlock(encodeEventNotes(notes));
  return withInternalMarker(withEditLink(block, "https://example.com/dashboard?date=2026-08-21&edit=e-1"));
}

const REF: EventRef = {
  calendarId: "d-1",
  googleEventId: "g-1",
  eventId: "e-1",
  start: "2026-08-21 14:00:00",
  end: "2026-08-21 15:30:00",
  allDay: false,
  creatorId: "u-1",
  inviteeUserIds: ["u-1", "u-2"],
  inviteeDepartmentIds: [],
};

function copy(description: string, location = ""): GcalEventItem {
  return {
    id: "g-1",
    calendarId: "google-cal-1",
    title: "rendered title",
    description,
    start: new Date("2026-08-21T06:00:00Z"),
    end: new Date("2026-08-21T07:30:00Z"),
    allDay: false,
    location,
  };
}

describe("snapshotFromCopy", () => {
  const names: EventSnapshotNames = {
    departmentNames: { "d-1": "COU" },
    userNames: { "u-1": "Tan Wei Liang", "u-2": "Lim Kah" },
  };

  it("parses the old state from a v3 copy's notes", () => {
    const snapshot = snapshotFromCopy(
      REF,
      copy(
        v3Description({
          eventId: "e-1",
          eventType: "Out of Camp",
          title: "Trip to Singapore",
          createdBy: "u-1",
          inviteeUsers: ["u-1", "u-2"],
          timeOption: "range",
          outOfCamp: true,
        }),
        "Singapore",
      ),
      names,
      ["d-1"],
    );
    expect(snapshot).toEqual({
      title: "rendered title",
      description: "Trip to Singapore",
      type: "Out of Camp",
      time: "2026-08-21 14:00 \u2013 15:30",
      outOfCamp: true,
      location: "Singapore",
      departments: ["COU"],
      invitees: ["Tan Wei Liang", "Lim Kah"],
      creator: "Tan Wei Liang",
    });
  });

  it("uses the copy's rendered title for a legacy copy without notes", () => {
    const snapshot = snapshotFromCopy(
      { ...REF, allDay: true, start: "2026-08-21 00:00:00", end: "2026-08-22 00:00:00" },
      copy("plain external-looking text", "Battlements"),
      names,
      ["d-1"],
    );
    expect(snapshot.title).toBe("rendered title");
    expect(snapshot.description).toBeNull();
    expect(snapshot.type).toBeNull();
    expect(snapshot.time).toBe("2026-08-21 \u2013 2026-08-22");
    expect(snapshot.outOfCamp).toBe(false);
    expect(snapshot.location).toBe("Battlements");
  });

  it("treats a missing copy as an unknown state", () => {
    const snapshot = snapshotFromCopy(REF, null, names, ["d-1"]);
    expect(snapshot.title).toBeNull();
    expect(snapshot.description).toBeNull();
    expect(snapshot.type).toBeNull();
    expect(snapshot.location).toBeNull();
    expect(snapshot.outOfCamp).toBe(false);
    expect(snapshot.time).toBe("2026-08-21 14:00 \u2013 15:30");
    expect(snapshot.invitees).toEqual(["Tan Wei Liang", "Lim Kah"]);
  });
});

describe("renderEventTitle", () => {
  const people = [{ full: "Tan Wei Liang", acronym: "TWL", fqn: "Tan Wei Liang" }];

  it("renders a template with description and type tokens", () => {
    expect(
      renderEventTitle({
        description: "Trip to Singapore",
        eventType: { name: "Out of Camp", acronym: "OUT" },
        people: [],
        departments: [],
        location: "Singapore",
        template: "{type:acronym} {description}",
        timeOption: "range",
        startAmPm: "",
        endAmPm: "",
      }),
    ).toBe("OUT Trip to Singapore");
  });

  it("renders a visible title from the template even when the description is blank", () => {
    expect(
      renderEventTitle({
        description: "",
        eventType: { name: "Out of Camp", acronym: "OUT" },
        people,
        departments: ["COU"],
        location: "",
        template: "{type:acronym} {people:full}",
        timeOption: "range",
        startAmPm: "",
        endAmPm: "",
      }),
    ).toBe("OUT Tan Wei Liang");
  });

  it("appends the shared AM/PM marker for full-day events", () => {
    expect(
      renderEventTitle({
        description: "Duty",
        eventType: null,
        people: [],
        departments: [],
        location: "",
        template: "{description}",
        timeOption: "full",
        startAmPm: "AM",
        endAmPm: "AM",
      }),
    ).toBe("Duty (AM)");
  });

  it("falls back to the raw description when the template renders nothing", () => {
    expect(
      renderEventTitle({
        description: "Trip to Singapore",
        eventType: { name: "Out of Camp", acronym: "OUT" },
        people: [],
        departments: [],
        location: "",
        template: "{location}",
        timeOption: "range",
        startAmPm: "",
        endAmPm: "",
      }),
    ).toBe("Trip to Singapore");
  });

  it("produces an empty title when the description and template both render nothing", () => {
    expect(
      renderEventTitle({
        description: "   ",
        eventType: null,
        people: [],
        departments: [],
        location: "",
        template: "{description}",
        timeOption: "range",
        startAmPm: "",
        endAmPm: "",
      }),
    ).toBe("");
  });
});
