import { describe, expect, it } from "vitest";

import { AUDIT_ACTIONS } from "@/lib/audit/build";

import {
  buildChangeTrail,
  buildHistoryEntries,
  groupTrailRows,
  relativeChangeLabel,
  type TrailRowInput,
} from "./changeTrail";

const NOW = new Date("2026-10-23T08:00:00Z");

function trailRow(partial: Partial<TrailRowInput> & { action: string; createdAt: Date }): TrailRowInput {
  return {
    eventId: "e1",
    actorName: "Me",
    actorRole: "user",
    entityName: "Site visit",
    details: {},
    ...partial,
  };
}

describe("relativeChangeLabel", () => {
  it("buckets minutes, hours, days, months, and years", () => {
    expect(relativeChangeLabel(new Date(NOW.getTime() - 30_000), NOW)).toBe("just now");
    expect(relativeChangeLabel(new Date(NOW.getTime() - 40 * 60_000), NOW)).toBe("40 min ago");
    expect(relativeChangeLabel(new Date(NOW.getTime() - 60 * 60_000), NOW)).toBe("1 hour ago");
    expect(relativeChangeLabel(new Date(NOW.getTime() - 5 * 3_600_000), NOW)).toBe("5 hours ago");
    expect(relativeChangeLabel(new Date(NOW.getTime() - 24 * 3_600_000), NOW)).toBe("1 day ago");
    expect(relativeChangeLabel(new Date(NOW.getTime() - 3 * 86_400_000), NOW)).toBe("3 days ago");
    expect(relativeChangeLabel(new Date(NOW.getTime() - 45 * 86_400_000), NOW)).toBe("1 month ago");
    expect(relativeChangeLabel(new Date(NOW.getTime() - 80 * 86_400_000), NOW)).toBe("2 months ago");
    expect(relativeChangeLabel(new Date(NOW.getTime() - 400 * 86_400_000), NOW)).toBe("1 year ago");
  });
});

describe("buildChangeTrail", () => {
  it("labels kinds newest-first and attaches actor + absolute stamp", () => {
    const items = buildChangeTrail(
      [
        trailRow({
          action: AUDIT_ACTIONS.eventUpdate,
          createdAt: new Date("2026-10-22T06:30:00Z"),
          details: { before: {}, after: {}, changes: { title: ["a", "b"] } },
        }),
        trailRow({ action: AUDIT_ACTIONS.eventCreate, createdAt: new Date("2026-10-20T01:05:00Z") }),
      ],
      NOW,
    );
    expect(items.map((item) => item.kind)).toEqual(["update", "create"]);
    expect(items[0].label).toBe("Edited");
    expect(items[0].summary).toBe("Title");
    expect(items[0].absolute).toBe("2026-10-22 14:30");
    expect(items[0].relative).toBe("1 day ago");
    expect(items[0].actor).toBe("Me (user)");
    expect(items[1].label).toBe("Created");
    expect(items[1].summary).toBeNull();
  });

  it("collapses the per-copy fan-out of one mutation (same action, same minute)", () => {
    const items = buildChangeTrail(
      [
        trailRow({ action: AUDIT_ACTIONS.eventUpdate, createdAt: new Date("2026-10-22T06:30:10Z") }),
        trailRow({ action: AUDIT_ACTIONS.eventUpdate, createdAt: new Date("2026-10-22T06:30:40Z") }),
        trailRow({ action: AUDIT_ACTIONS.eventUpdate, createdAt: new Date("2026-10-22T06:30:59Z") }),
      ],
      NOW,
    );
    expect(items).toHaveLength(1);
  });

  it("keeps different actions in the same minute and the same action in different minutes", () => {
    const items = buildChangeTrail(
      [
        trailRow({ action: AUDIT_ACTIONS.eventDelete, createdAt: new Date("2026-10-22T06:30:50Z") }),
        trailRow({ action: AUDIT_ACTIONS.eventUpdate, createdAt: new Date("2026-10-22T06:30:10Z") }),
        trailRow({ action: AUDIT_ACTIONS.eventUpdate, createdAt: new Date("2026-10-21T06:30:10Z") }),
      ],
      NOW,
    );
    expect(items.map((item) => item.kind)).toEqual(["delete", "update", "update"]);
  });

  it("drops non-change rows (participant notifications)", () => {
    const items = buildChangeTrail(
      [
        trailRow({ action: AUDIT_ACTIONS.eventParticipantNotify, createdAt: NOW }),
        trailRow({ action: AUDIT_ACTIONS.eventCreate, createdAt: new Date("2026-10-20T01:00:00Z") }),
      ],
      NOW,
    );
    expect(items.map((item) => item.kind)).toEqual(["create"]);
  });
});

describe("buildHistoryEntries", () => {
  it("mirrors the trail headers and keeps the group's details for the diff", () => {
    const details = { before: {}, after: {}, changes: { title: ["a", "b"] } };
    const items = buildHistoryEntries(
      [
        trailRow({ action: AUDIT_ACTIONS.eventUpdate, createdAt: new Date("2026-10-22T06:30:00Z"), details }),
        trailRow({ action: AUDIT_ACTIONS.eventCreate, createdAt: new Date("2026-10-20T01:05:00Z") }),
      ],
      NOW,
    );
    expect(items.map((item) => item.kind)).toEqual(["update", "create"]);
    expect(items[0].details).toBe(details);
    expect(items[1].details).toEqual({});
    const trail = buildChangeTrail(
      [
        trailRow({ action: AUDIT_ACTIONS.eventUpdate, createdAt: new Date("2026-10-22T06:30:00Z"), details }),
        trailRow({ action: AUDIT_ACTIONS.eventCreate, createdAt: new Date("2026-10-20T01:05:00Z") }),
      ],
      NOW,
    );
    expect(items.map(({ kind, label, relative, absolute, actor, summary }) => ({
      kind,
      label,
      relative,
      absolute,
      actor,
      summary,
    }))).toEqual(trail);
  });

  it("collapses the per-copy fan-out to the newest row's details", () => {
    const newest = { before: {}, after: {}, changes: { title: ["a", "b"] } };
    const items = buildHistoryEntries(
      [
        trailRow({ action: AUDIT_ACTIONS.eventUpdate, createdAt: new Date("2026-10-22T06:30:40Z"), details: newest }),
        trailRow({ action: AUDIT_ACTIONS.eventUpdate, createdAt: new Date("2026-10-22T06:30:10Z"), details: {} }),
      ],
      NOW,
    );
    expect(items).toHaveLength(1);
    expect(items[0].details).toBe(newest);
  });

  it("drops participant-notify rows", () => {
    const items = buildHistoryEntries(
      [
        trailRow({ action: AUDIT_ACTIONS.eventParticipantNotify, createdAt: NOW }),
        trailRow({ action: AUDIT_ACTIONS.eventCreate, createdAt: new Date("2026-10-20T01:00:00Z") }),
      ],
      NOW,
    );
    expect(items.map((item) => item.kind)).toEqual(["create"]);
  });
});

describe("groupTrailRows", () => {
  it("groups by event id preserving order", () => {
    const grouped = groupTrailRows([
      trailRow({ eventId: "a", action: AUDIT_ACTIONS.eventUpdate, createdAt: NOW }),
      trailRow({ eventId: "b", action: AUDIT_ACTIONS.eventCreate, createdAt: NOW }),
      trailRow({ eventId: "a", action: AUDIT_ACTIONS.eventCreate, createdAt: NOW }),
    ]);
    expect([...grouped.keys()]).toEqual(["a", "b"]);
    expect(grouped.get("a")?.map((row) => row.action)).toEqual([
      AUDIT_ACTIONS.eventUpdate,
      AUDIT_ACTIONS.eventCreate,
    ]);
  });
});
