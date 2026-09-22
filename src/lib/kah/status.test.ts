import { describe, expect, it } from "vitest";

import { addDays, parseNaiveToInstant } from "@/lib/events/datetime";
import { encodeEventNotes, encodeNotesBlock } from "@/lib/events/notes";
import type { KahGroupCheck } from "@/lib/kah/check";

import {
  busyDaysInRange,
  dedupeOverseasEventsByGroupId,
  eventTakesMembersOverseas,
  eventsForGroupEpisode,
  isUuid,
  kahBreachEpisodes,
  kahStatusForWindow,
  memberIdsAwayOnEvent,
  windowMonths,
  type KahDayStatus,
  type KahOverseasEvent,
} from "./status";

/** A description carrying the given notes fields (an in-app internal event). */
function notesDescription(notes: { outOfCamp?: boolean; overseas?: boolean }): string {
  return encodeNotesBlock(encodeEventNotes(notes));
}

const makeGroup = (overrides: Partial<KahGroupCheck> & { id: string }): KahGroupCheck => ({
  name: overrides.id,
  minPercentage: 60,
  memberIds: [],
  ...overrides,
});

describe("kahStatusForWindow", () => {
  it("reports a safe group at or above its requirement", () => {
    const status = kahStatusForWindow(
      [makeGroup({ id: "g1", minPercentage: 60, memberIds: ["a", "b", "c"] })],
      new Set(["a"]),
    );
    expect(status).toEqual([
      {
        groupId: "g1",
        name: "g1",
        requiredPct: 60,
        actualPct: 66,
        totalMembers: 3,
        awayIds: ["a"],
        breached: false,
      },
    ]);
  });

  it("meets a requirement exactly at equality (not a breach)", () => {
    // 3 members with 2 in country = 66%, exactly meeting a 66% requirement.
    const status = kahStatusForWindow(
      [makeGroup({ id: "g1", minPercentage: 66, memberIds: ["a", "b", "c"] })],
      new Set(["a"]),
    );
    expect(status[0]).toMatchObject({ actualPct: 66, breached: false, awayIds: ["a"] });
  });

  it("flags a strict breach below the threshold", () => {
    const status = kahStatusForWindow(
      [makeGroup({ id: "g1", minPercentage: 70, memberIds: ["a", "b", "c"] })],
      new Set(["a", "b"]),
    );
    // 1/3 in country = 33% < 70%.
    expect(status[0]).toMatchObject({ actualPct: 33, breached: true, awayIds: ["a", "b"] });
  });

  it("reports an empty group at 100% and never breaches", () => {
    const status = kahStatusForWindow([makeGroup({ id: "g1", memberIds: [] })], new Set(["a"]));
    expect(status[0]).toMatchObject({ actualPct: 100, totalMembers: 0, breached: false });
  });

  it("collapses duplicate member ids and ignores away ids not in the group", () => {
    const status = kahStatusForWindow(
      [makeGroup({ id: "g1", minPercentage: 100, memberIds: ["a", "a", "b"] })],
      new Set(["a", "ghost"]),
    );
    // 2 unique members, 1 away -> 1/2 = 50% < 100%.
    expect(status[0]).toMatchObject({ totalMembers: 2, awayIds: ["a"], actualPct: 50, breached: true });
  });

  it("keeps input order and covers every group", () => {
    const status = kahStatusForWindow(
      [
        makeGroup({ id: "g1", memberIds: [] }),
        makeGroup({ id: "g2", minPercentage: 100, memberIds: ["a"] }),
      ],
      new Set(["a"]),
    );
    expect(status.map((s) => s.groupId)).toEqual(["g1", "g2"]);
  });
});

describe("eventTakesMembersOverseas", () => {
  it("is true only for events marked overseas (out of camp + overseas)", () => {
    expect(eventTakesMembersOverseas(notesDescription({ outOfCamp: true, overseas: true }))).toBe(
      true,
    );
  });

  it("is false for in-camp events", () => {
    expect(eventTakesMembersOverseas(notesDescription({ outOfCamp: false }))).toBe(false);
    expect(eventTakesMembersOverseas(notesDescription({}))).toBe(false);
  });

  it("is false for out-of-camp events that are not overseas", () => {
    expect(eventTakesMembersOverseas(notesDescription({ outOfCamp: true, overseas: false }))).toBe(
      false,
    );
    expect(eventTakesMembersOverseas(notesDescription({ outOfCamp: true }))).toBe(false);
  });

  it("is false for descriptions without a notes block (legacy/external)", () => {
    expect(eventTakesMembersOverseas("")).toBe(false);
    expect(eventTakesMembersOverseas("A plain Google event")).toBe(false);
  });
});

describe("isUuid", () => {
  it("accepts canonical UUIDs", () => {
    expect(isUuid("0b8d5f2e-1c47-4a90-9d3e-6f1a2b3c4d5e")).toBe(true);
    expect(isUuid("0B8D5F2E-1C47-4A90-9D3E-6F1A2B3C4D5E")).toBe(true);
  });

  it("rejects synthetic non-roster identities and malformed ids", () => {
    expect(isUuid("admin")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid("0b8d5f2e1c474a909d3e6f1a2b3c4d5e")).toBe(false);
    expect(isUuid("0b8d5f2e-1c47-4a90-9d3e-6f1a2b3c4d5")).toBe(false);
  });
});

const commandGroup = makeGroup({
  id: "g1",
  name: "Command",
  minPercentage: 60,
  memberIds: ["a", "b", "c"],
});
const opsGroup = makeGroup({ id: "g2", name: "Ops", minPercentage: 100, memberIds: ["z"] });

/** Contiguous `YYYY-MM-DD` days starting at `start` (inclusive). */
function dateRange(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

function overseasEvent(
  start: string,
  end: string,
  people: { creatorId?: string | null; userIds?: string[] },
): KahOverseasEvent {
  return {
    start: parseNaiveToInstant(start),
    end: parseNaiveToInstant(end),
    creatorId: people.creatorId ?? null,
    userIds: people.userIds ?? [],
  };
}

describe("windowMonths", () => {
  it("does not read the month after a window that ends exactly on a month boundary", () => {
    // May 1 00:00 → Dec 1 00:00 (UTC+8) covers May–Nov — December's listing
    // can only hold events that also overlap November.
    expect(
      windowMonths(
        parseNaiveToInstant("2026-05-01 00:00:00"),
        parseNaiveToInstant("2026-12-01 00:00:00"),
      ),
    ).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
  });

  it("includes the end month when the window extends past the boundary", () => {
    expect(
      windowMonths(
        parseNaiveToInstant("2026-11-30 22:00:00"),
        parseNaiveToInstant("2026-12-01 02:00:00"),
      ),
    ).toEqual(["2026-11", "2026-12"]);
  });

  it("keeps a same-month window in its single month", () => {
    expect(
      windowMonths(
        parseNaiveToInstant("2026-08-10 10:00:00"),
        parseNaiveToInstant("2026-08-10 17:00:00"),
      ),
    ).toEqual(["2026-08"]);
  });
});

describe("busyDaysInRange", () => {
  it("marks a member away only on days their timed overseas event covers", () => {
    // 08:00–17:00 SGT on Aug 10 == [Aug 10 00:00Z, Aug 10 09:00Z).
    const result = busyDaysInRange(
      [overseasEvent("2026-08-10 08:00:00", "2026-08-10 17:00:00", { userIds: ["a"] })],
      ["2026-08-09", "2026-08-10", "2026-08-11"],
    );
    expect(result.map((day) => day.awayIds)).toEqual([[], ["a"], []]);
  });

  it("spans multi-day events across every covered day, creator and invitees deduped", () => {
    // Aug 10 20:00 → Aug 12 09:00 SGT covers all three UTC+8 days.
    const trip = overseasEvent("2026-08-10 20:00:00", "2026-08-12 09:00:00", {
      creatorId: "a",
      userIds: ["a", "b"],
    });
    const result = busyDaysInRange([trip], ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13"]);
    expect(result.map((day) => day.awayIds)).toEqual([
      ["a", "b"],
      ["a", "b"],
      ["a", "b"],
      [],
    ]);
  });

  it("marks a one-day all-day event on its own day only (effective window realigned to SGT)", () => {
    // `overseasEventsInRange` realigns an all-day Aug 10 event
    // ([Aug 10 00:00Z, Aug 11 00:00Z)) to the SGT civil day
    // ([Aug 10 00:00, Aug 11 00:00) UTC+8), so it covers Aug 10 alone and no
    // longer bleeds 8 h into Aug 11.
    const allDay = overseasEvent("2026-08-10 00:00:00", "2026-08-11 00:00:00", { userIds: ["a"] });
    const result = busyDaysInRange([allDay], ["2026-08-09", "2026-08-10", "2026-08-11"]);
    expect(result.map((day) => day.awayIds)).toEqual([[], ["a"], []]);
  });

  it("does not count a day an event ends exactly at (half-open boundary)", () => {
    // [Aug 10 08:00, Aug 11 00:00) ends on Aug 11's boundary → Aug 10 only.
    const result = busyDaysInRange(
      [overseasEvent("2026-08-10 08:00:00", "2026-08-11 00:00:00", { userIds: ["a"] })],
      ["2026-08-10", "2026-08-11"],
    );
    expect(result.map((day) => day.awayIds)).toEqual([["a"], []]);
  });

  it("returns empty away sets when no events are given", () => {
    expect(busyDaysInRange([], ["2026-08-10"])).toEqual([{ date: "2026-08-10", awayIds: [] }]);
  });
});

describe("dedupeOverseasEventsByGroupId", () => {
  it("collapses cross-calendar copies sharing a group id, keeping the first", () => {
    const events = [
      { eventId: "g", calendarId: "c1", googleEventId: "e1" },
      { eventId: "g", calendarId: "c2", googleEventId: "e2" },
      { eventId: "h", calendarId: "c1", googleEventId: "e3" },
    ];
    expect(dedupeOverseasEventsByGroupId(events)).toEqual([
      { eventId: "g", calendarId: "c1", googleEventId: "e1" },
      { eventId: "h", calendarId: "c1", googleEventId: "e3" },
    ]);
  });

  it("dedupes groupless copies by (calendar, Google id)", () => {
    const events = [
      { eventId: null, calendarId: "c1", googleEventId: "e1" },
      { eventId: null, calendarId: "c1", googleEventId: "e1" },
      { eventId: null, calendarId: "c2", googleEventId: "e1" },
    ];
    expect(dedupeOverseasEventsByGroupId(events)).toHaveLength(2);
  });
});

describe("memberIdsAwayOnEvent", () => {
  it("returns the members tagged on the event, deduped", () => {
    expect(memberIdsAwayOnEvent({ userIds: ["a", "c", "a"] }, new Set(["a", "b"]))).toEqual(["a"]);
  });

  it("returns nothing when no tagged user is a member", () => {
    expect(memberIdsAwayOnEvent({ userIds: ["c"] }, new Set(["a"]))).toEqual([]);
  });
});

describe("eventsForGroupEpisode", () => {
  const event = (start: string, end: string, userIds: string[]) => ({
    start: parseNaiveToInstant(start),
    end: parseNaiveToInstant(end),
    userIds,
  });

  it("keeps overlapping events that take a group member away, dropping others", () => {
    const memberIds = new Set(["a"]);
    const events = [
      event("2026-08-10 00:00:00", "2026-08-11 00:00:00", ["a"]), // overlaps + member
      event("2026-08-05 00:00:00", "2026-08-06 00:00:00", ["a"]), // before the window
      event("2026-08-10 00:00:00", "2026-08-11 00:00:00", ["b"]), // no group member
    ];
    const result = eventsForGroupEpisode(
      events,
      memberIds,
      parseNaiveToInstant("2026-08-10 00:00:00"),
      parseNaiveToInstant("2026-08-11 00:00:00"),
    );
    expect(result).toEqual([events[0]]);
  });

  it("excludes an event ending exactly at the window start (half-open)", () => {
    const events = [event("2026-08-09 00:00:00", "2026-08-10 00:00:00", ["a"])];
    expect(
      eventsForGroupEpisode(
        events,
        new Set(["a"]),
        parseNaiveToInstant("2026-08-10 00:00:00"),
        parseNaiveToInstant("2026-08-11 00:00:00"),
      ),
    ).toEqual([]);
  });
});

describe("kahBreachEpisodes", () => {
  // Command: 3 members, 60% required — 2 away (33%) breaches, 1 away (66%) is OK.
  const scan = (days: string[], awayByDate: Record<string, string[]>): KahDayStatus[] =>
    days.map((date) => ({
      date,
      statuses: kahStatusForWindow([commandGroup], new Set(awayByDate[date] ?? [])),
    }));

  it("returns nothing for an empty scan or when no day breaches", () => {
    expect(kahBreachEpisodes([], "2026-08-30")).toEqual([]);
    expect(kahBreachEpisodes(scan(["2026-08-10"], {}), "2026-08-30")).toEqual([]);
  });

  it("groups a past single-day breach into one resolved episode", () => {
    const episodes = kahBreachEpisodes(
      scan(["2026-08-10", "2026-08-11", "2026-08-12"], { "2026-08-11": ["a", "b"] }),
      "2026-08-30",
    );
    expect(episodes).toEqual([
      {
        groupId: "g1",
        groupName: "Command",
        requiredPct: 60,
        startDate: "2026-08-11",
        endDate: "2026-08-11",
        days: 1,
        worstPct: 33,
        clippedStart: false,
        clippedEnd: false,
        status: "resolved",
        awayIds: ["a", "b"],
      },
    ]);
  });

  it("marks a run including today as active, also when it starts or ends on today", () => {
    const endingToday = kahBreachEpisodes(
      scan(dateRange("2026-08-28", 3), {
        "2026-08-28": ["a", "b"],
        "2026-08-29": ["a", "b"],
        "2026-08-30": ["a", "b"],
      }),
      "2026-08-30",
    );
    expect(endingToday).toHaveLength(1);
    expect(endingToday[0]).toMatchObject({
      startDate: "2026-08-28",
      endDate: "2026-08-30",
      days: 3,
      status: "active",
    });

    const startingToday = kahBreachEpisodes(
      scan(dateRange("2026-08-30", 3), {
        "2026-08-30": ["a", "b"],
        "2026-08-31": ["a", "b"],
        "2026-09-01": ["a", "b"],
      }),
      "2026-08-30",
    );
    expect(startingToday[0]).toMatchObject({
      startDate: "2026-08-30",
      endDate: "2026-09-01",
      status: "active",
    });
  });

  it("marks a future run as upcoming", () => {
    const episodes = kahBreachEpisodes(
      scan(["2026-09-05", "2026-09-06"], { "2026-09-05": ["a", "b"], "2026-09-06": ["a", "b"] }),
      "2026-08-30",
    );
    expect(episodes).toHaveLength(1);
    expect(episodes[0]).toMatchObject({
      startDate: "2026-09-05",
      endDate: "2026-09-06",
      days: 2,
      status: "upcoming",
    });
  });

  it("splits non-contiguous breaches into separate episodes", () => {
    const episodes = kahBreachEpisodes(
      scan(dateRange("2026-08-10", 5), {
        "2026-08-10": ["a", "b"],
        "2026-08-11": ["a", "b"],
        // Aug 12: no one away — the run breaks.
        "2026-08-13": ["a", "b"],
        "2026-08-14": ["a", "b"],
      }),
      "2026-08-30",
    );
    expect(episodes).toHaveLength(2);
    expect(episodes.map((e) => [e.startDate, e.endDate])).toEqual([
      ["2026-08-13", "2026-08-14"],
      ["2026-08-10", "2026-08-11"],
    ]);
  });

  it("records the lowest % and unions the away members across the run", () => {
    const episodes = kahBreachEpisodes(
      scan(["2026-08-10", "2026-08-11"], {
        "2026-08-10": ["a", "b"], // 33%
        "2026-08-11": ["a", "b", "c"], // 0%
      }),
      "2026-08-30",
    );
    expect(episodes).toHaveLength(1);
    expect(episodes[0].worstPct).toBe(0);
    expect(episodes[0].days).toBe(2);
    expect([...episodes[0].awayIds].sort()).toEqual(["a", "b", "c"]);
  });

  it("flags runs clipped at the scanned window's edges", () => {
    const fullWindow = kahBreachEpisodes(
      scan(["2026-08-01", "2026-08-02", "2026-08-03"], {
        "2026-08-01": ["a", "b"],
        "2026-08-02": ["a", "b"],
        "2026-08-03": ["a", "b"],
      }),
      "2026-08-30",
    );
    expect(fullWindow[0]).toMatchObject({ clippedStart: true, clippedEnd: true, status: "resolved" });

    const clippedEndOnly = kahBreachEpisodes(
      scan(["2026-08-28", "2026-08-29", "2026-08-30"], {
        // Aug 28: no one away — the run starts mid-window.
        "2026-08-29": ["a", "b"],
        "2026-08-30": ["a", "b"],
      }),
      "2026-08-30",
    );
    expect(clippedEndOnly[0]).toMatchObject({
      clippedStart: false,
      clippedEnd: true,
      status: "active",
    });
  });

  it("never episodes an empty group", () => {
    const days = ["2026-08-10", "2026-08-11"];
    const perDay: KahDayStatus[] = days.map((date) => ({
      date,
      statuses: kahStatusForWindow(
        [makeGroup({ id: "g-empty", memberIds: [] }), commandGroup],
        new Set(["a", "b"]),
      ),
    }));
    const episodes = kahBreachEpisodes(perDay, "2026-08-30");
    expect(episodes.map((e) => e.groupId)).toEqual(["g1"]);
  });

  it("orders active (oldest first), upcoming (oldest first), then resolved (newest first)", () => {
    const days = dateRange("2026-08-01", 37); // Aug 1 → Sep 6
    const awayByDate: Record<string, string[]> = {
      "2026-08-01": ["a", "b"],
      "2026-08-02": ["a", "b"],
      "2026-08-29": ["a", "b", "z"],
      "2026-08-30": ["a", "b", "z"],
      "2026-09-05": ["a", "b"],
      "2026-09-06": ["a", "b"],
    };
    const perDay: KahDayStatus[] = days.map((date) => ({
      date,
      statuses: kahStatusForWindow([commandGroup, opsGroup], new Set(awayByDate[date] ?? [])),
    }));
    const episodes = kahBreachEpisodes(perDay, "2026-08-30");
    expect(
      episodes.map((e) => [e.groupId, e.status, e.startDate, e.endDate]),
    ).toEqual([
      ["g1", "active", "2026-08-29", "2026-08-30"],
      ["g2", "active", "2026-08-29", "2026-08-30"],
      ["g1", "upcoming", "2026-09-05", "2026-09-06"],
      ["g1", "resolved", "2026-08-01", "2026-08-02"],
    ]);
  });
});
