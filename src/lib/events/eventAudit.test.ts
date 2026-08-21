import { describe, expect, it } from "vitest";

import type { GcalEventItem } from "@/lib/google";

import {
  buildEventSnapshot,
  formatEventAuditTime,
  snapshotFromCopy,
  type EventSnapshotNames,
} from "./eventAudit";
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
      title: "Trip to Singapore",
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
      title: "Trip to Singapore",
      type: "Out of Camp",
      time: "2026-08-21 14:00 \u2013 15:30",
      outOfCamp: true,
      location: "Singapore",
      departments: ["COU", "LOG"],
      invitees: ["Tan Wei Liang", "Lim Kah"],
      creator: "Tan Wei Liang",
    });
  });

  it("turns blank title, type, and location into null and drops unknown ids", () => {
    const snapshot = buildEventSnapshot({
      title: "   ",
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
      title: "Trip to Singapore",
      type: "Out of Camp",
      time: "2026-08-21 14:00 \u2013 15:30",
      outOfCamp: true,
      location: "Singapore",
      departments: ["COU"],
      invitees: ["Tan Wei Liang", "Lim Kah"],
      creator: "Tan Wei Liang",
    });
  });

  it("falls back to the ref and defaults for a legacy copy without notes", () => {
    const snapshot = snapshotFromCopy(
      { ...REF, allDay: true, start: "2026-08-21 00:00:00", end: "2026-08-22 00:00:00" },
      copy("plain external-looking text", "Battlements"),
      names,
      ["d-1"],
    );
    expect(snapshot.title).toBeNull();
    expect(snapshot.type).toBeNull();
    expect(snapshot.time).toBe("2026-08-21 \u2013 2026-08-22");
    expect(snapshot.outOfCamp).toBe(false);
    expect(snapshot.location).toBe("Battlements");
  });

  it("treats a missing copy as an unknown state", () => {
    const snapshot = snapshotFromCopy(REF, null, names, ["d-1"]);
    expect(snapshot.title).toBeNull();
    expect(snapshot.type).toBeNull();
    expect(snapshot.location).toBeNull();
    expect(snapshot.outOfCamp).toBe(false);
    expect(snapshot.time).toBe("2026-08-21 14:00 \u2013 15:30");
    expect(snapshot.invitees).toEqual(["Tan Wei Liang", "Lim Kah"]);
  });
});
