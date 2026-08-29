import { describe, expect, it } from "vitest";

import {
  buildEventSnapshot,
  type EventSnapshotNames,
  type EventTimeParts,
} from "@/lib/events/eventAudit";
import { WEBHOOK_ACTIONS } from "./payload";
import { buildEventWebhookPayload } from "./payload";

const names: EventSnapshotNames = {
  departmentNames: { "dept-1": "Alpha", "dept-2": "Bravo" },
  userNames: { "user-1": "Alice", "user-2": "Bob" },
};

const timeParts = {
  timeOption: "half" as const,
  start: "2026-08-21 00:00:00",
  end: "2026-08-23 00:00:00",
  startAmPm: "AM" as const,
  endAmPm: "PM" as const,
};

const snapshot = buildEventSnapshot({
  title: "Range Alpha",
  description: "Field training",
  type: "Exercise",
  timeParts,
  outOfCamp: true,
  overseas: false,
  pinned: true,
  location: "Range North",
  departmentIds: ["dept-1", "dept-2"],
  inviteeUserIds: ["user-2", "user-1"],
  creatorId: "user-1",
  names,
});

describe("buildEventWebhookPayload", () => {
  it("builds a create payload with structured datetime fields", () => {
    const payload = buildEventWebhookPayload({
      action: WEBHOOK_ACTIONS.eventCreated,
      eventId: "group-1",
      googleEventIds: ["gcal-a", "gcal-b"],
      snapshot,
      timeParts,
      changes: null,
      actor: { name: "Alice", role: "admin" },
      occurredAt: new Date("2026-08-20T01:02:03.000Z"),
    });

    expect(payload).toEqual({
      action: "event.created",
      eventId: "group-1",
      googleEventIds: ["gcal-a", "gcal-b"],
      occurredAt: "2026-08-20T01:02:03.000Z",
      actor: { name: "Alice", role: "admin" },
      event: {
        title: "Range Alpha",
        description: "Field training",
        type: "Exercise",
        time: "2026-08-21 (AM) \u2013 2026-08-23 (PM)",
        outOfCamp: true,
        overseas: false,
        pinned: true,
        location: "Range North",
        departments: ["Alpha", "Bravo"],
        invitees: ["Bob", "Alice"],
        creator: "Alice",
        timeOption: "half",
        start: "2026-08-21 00:00:00",
        end: "2026-08-23 00:00:00",
        startAmPm: "AM",
        endAmPm: "PM",
      },
    });
    expect("changes" in payload).toBe(false);
  });

  it("includes changes only when provided (update)", () => {
    const payload = buildEventWebhookPayload({
      action: WEBHOOK_ACTIONS.eventUpdated,
      eventId: "group-1",
      googleEventIds: ["gcal-a"],
      snapshot,
      timeParts,
      changes: { location: ["Range North", "Range South"] },
      actor: { name: "Bob", role: "user" },
      occurredAt: new Date(0),
    });

    expect(payload.action).toBe("event.updated");
    expect(payload.changes).toEqual({ location: ["Range North", "Range South"] });
  });

  it("omits structured datetime fields when time parts are unknown (delete of legacy event)", () => {
    const payload = buildEventWebhookPayload({
      action: WEBHOOK_ACTIONS.eventDeleted,
      eventId: null,
      googleEventIds: [],
      snapshot,
      timeParts: null,
      changes: null,
      actor: { name: null, role: "admin" },
      occurredAt: new Date(0),
    });

    expect(payload.eventId).toBeNull();
    expect(payload.googleEventIds).toEqual([]);
    expect(payload.event.timeOption).toBeUndefined();
    expect(payload.event.start).toBeUndefined();
    expect(payload.event.end).toBeUndefined();
    expect(payload.event.startAmPm).toBeUndefined();
    expect(payload.event.endAmPm).toBeUndefined();
    // The pre-formatted display time is always present as a fallback.
    expect(payload.event.time).toBe("2026-08-21 (AM) \u2013 2026-08-23 (PM)");
  });

  it("normalizes blank AM/PM markers to null in the structured fields", () => {
    const rangeParts: EventTimeParts = {
      timeOption: "range",
      start: "2026-08-21 09:00:00",
      end: "2026-08-21 10:00:00",
      startAmPm: "",
      endAmPm: "",
    };
    const payload = buildEventWebhookPayload({
      action: WEBHOOK_ACTIONS.eventCreated,
      eventId: "group-1",
      googleEventIds: [],
      snapshot: buildEventSnapshot({
        title: "Briefing",
        description: "",
        type: "Meeting",
        timeParts: rangeParts,
        outOfCamp: false,
        overseas: false,
        pinned: false,
        location: "",
        departmentIds: [],
        inviteeUserIds: [],
        creatorId: "user-1",
        names,
      }),
      timeParts: rangeParts,
      changes: null,
      actor: { name: "Alice", role: "user" },
      occurredAt: new Date(0),
    });

    expect(payload.event.timeOption).toBe("range");
    expect(payload.event.startAmPm).toBeNull();
    expect(payload.event.endAmPm).toBeNull();
  });

  it("copies arrays so mutating the payload cannot alias the input snapshot", () => {
    const payload = buildEventWebhookPayload({
      action: WEBHOOK_ACTIONS.eventCreated,
      eventId: "group-1",
      googleEventIds: ["gcal-a"],
      snapshot,
      timeParts: null,
      changes: null,
      actor: { name: "Alice", role: "admin" },
      occurredAt: new Date(0),
    });

    payload.event.departments.push("Charlie");
    payload.googleEventIds.push("gcal-z");

    expect(snapshot.departments).toEqual(["Alpha", "Bravo"]);
  });
});
