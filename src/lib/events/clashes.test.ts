import { describe, expect, it } from "vitest";

import {
  busyUsersOfEvent,
  candidateUsers,
  computeClashes,
  instantWindowsOverlap,
  type ClashCandidateInput,
  type ClashEventInput,
} from "./clashes";

function instant(naive: string): Date {
  // UTC+8 fixed: "YYYY-MM-DD HH:mm:ss" as the project's naive strings.
  const [datePart, timePart = "00:00:00"] = naive.split(" ");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm, ss] = timePart.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh - 8, mm, ss));
}

function makeEvent(
  overrides: Partial<ClashEventInput> & Pick<ClashEventInput, "start" | "end">,
): ClashEventInput {
  return {
    calendarId: "cal-1",
    googleEventId: "g-1",
    eventId: null,
    calendarName: "Ops",
    title: "Existing event",
    allDay: false,
    external: false,
    people: { creatorId: null, userIds: [], departmentIds: [] },
    ...overrides,
  };
}

const rosterUsers = () => [
  { id: "u1", departmentId: "cal-1" },
  { id: "u2", departmentId: "cal-1" },
  { id: "u3", departmentId: "cal-2" },
  { id: "u4", departmentId: "cal-2" },
];

const roster = (rows: { id: string; departmentId: string | null }[]) => {
  const members = new Map<string, string[]>();
  for (const user of rows) {
    if (user.departmentId) {
      const list = members.get(user.departmentId) ?? [];
      list.push(user.id);
      members.set(user.departmentId, list);
    }
  }
  return members as ReadonlyMap<string, readonly string[]>;
};

describe("instantWindowsOverlap", () => {
  it("overlaps when windows intersect", () => {
    expect(
      instantWindowsOverlap(
        instant("2026-08-17 09:00:00"),
        instant("2026-08-17 10:00:00"),
        instant("2026-08-17 09:30:00"),
        instant("2026-08-17 10:30:00"),
      ),
    ).toBe(true);
  });

  it("does not clash for back-to-back windows", () => {
    expect(
      instantWindowsOverlap(
        instant("2026-08-17 09:00:00"),
        instant("2026-08-17 10:00:00"),
        instant("2026-08-17 10:00:00"),
        instant("2026-08-17 11:00:00"),
      ),
    ).toBe(false);
  });

  it("does not clash when fully separated", () => {
    expect(
      instantWindowsOverlap(
        instant("2026-08-17 09:00:00"),
        instant("2026-08-17 10:00:00"),
        instant("2026-08-17 12:00:00"),
        instant("2026-08-17 13:00:00"),
      ),
    ).toBe(false);
  });

  it("one event enclosing the other still overlaps", () => {
    expect(
      instantWindowsOverlap(
        instant("2026-08-17 08:00:00"),
        instant("2026-08-17 18:00:00"),
        instant("2026-08-17 09:00:00"),
        instant("2026-08-17 10:00:00"),
      ),
    ).toBe(true);
  });
});

describe("busyUsersOfEvent", () => {
  const members = roster([
    { id: "u1", departmentId: "cal-1" },
    { id: "u2", departmentId: "cal-1" },
    { id: "u3", departmentId: "cal-2" },
  ]);

  it("occupies only the creator when no one else is tagged", () => {
    const event = makeEvent({
      start: instant("2026-08-17 09:00:00"),
      end: instant("2026-08-17 10:00:00"),
      people: { creatorId: "u1", userIds: [], departmentIds: [] },
    });
    expect([...busyUsersOfEvent(event, members)]).toEqual(["u1"]);
  });

  it("expands a tagged department to its active members", () => {
    const event = makeEvent({
      start: instant("2026-08-17 09:00:00"),
      end: instant("2026-08-17 10:00:00"),
      people: { creatorId: "u1", userIds: [], departmentIds: ["cal-1"] },
    });
    expect([...busyUsersOfEvent(event, members)]).toEqual(["u1", "u2"]);
  });

  it("external events with no people occupy their calendar's members", () => {
    const event = makeEvent({
      start: instant("2026-08-17 09:00:00"),
      end: instant("2026-08-17 10:00:00"),
      calendarId: "cal-2",
      external: true,
      people: { creatorId: null, userIds: [], departmentIds: [] },
    });
    expect([...busyUsersOfEvent(event, members)]).toEqual(["u3"]);
  });

  it("departments outside the roster membership map contribute nothing", () => {
    const event = makeEvent({
      start: instant("2026-08-17 09:00:00"),
      end: instant("2026-08-17 10:00:00"),
      people: { creatorId: "u1", userIds: [], departmentIds: ["cal-missing"] },
    });
    expect([...busyUsersOfEvent(event, members)]).toEqual(["u1"]);
  });
});

describe("candidateUsers", () => {
  const members = roster([
    { id: "u1", departmentId: "cal-1" },
    { id: "u2", departmentId: "cal-1" },
  ]);

  it("includes the creator, tagged users, and members of tagged departments", () => {
    const candidate: ClashCandidateInput = {
      start: instant("2026-08-17 09:00:00"),
      end: instant("2026-08-17 10:00:00"),
      creatorId: "u1",
      inviteeUserIds: ["u3"],
      inviteeDepartments: ["cal-1"],
    };
    const active = new Set(["u1", "u2", "u3"]);
    const users = candidateUsers(candidate, active, members);
    expect([...users.keys()].sort()).toEqual(["u1", "u2", "u3"]);
    expect(users.get("u1")).toBeNull();
    expect(users.get("u2")).toBe("cal-1");
  });

  it("drops explicit users not on the active roster", () => {
    const candidate: ClashCandidateInput = {
      start: instant("2026-08-17 09:00:00"),
      end: instant("2026-08-17 10:00:00"),
      creatorId: "u1",
      inviteeUserIds: ["ghost"],
      inviteeDepartments: [],
    };
    const users = candidateUsers(candidate, new Set(["u1"]), members);
    expect([...users.keys()]).toEqual(["u1"]);
  });
});

describe("computeClashes", () => {
  const candidate: ClashCandidateInput = {
    start: instant("2026-08-17 09:00:00"),
    end: instant("2026-08-17 11:00:00"),
    creatorId: "u1",
    inviteeUserIds: ["u3"],
    inviteeDepartments: [],
  };

  it("returns no clashes when nothing overlaps", () => {
    const result = computeClashes({
      candidate,
      events: [
        makeEvent({
          start: instant("2026-08-17 11:00:00"),
          end: instant("2026-08-17 12:00:00"),
          people: { creatorId: "u1", userIds: [], departmentIds: [] },
        }),
      ],
      activeUsers: rosterUsers(),
    });
    expect(result.clashes).toEqual([]);
    expect(result.checkedPeople).toBe(2);
  });

  it("flags an overlap with the creator", () => {
    const result = computeClashes({
      candidate,
      events: [
        makeEvent({
          start: instant("2026-08-17 10:00:00"),
          end: instant("2026-08-17 12:00:00"),
          people: { creatorId: "u1", userIds: [], departmentIds: [] },
        }),
      ],
      activeUsers: rosterUsers(),
    });
    expect(result.clashes).toHaveLength(1);
    expect(result.clashes[0].affectedUserIds).toEqual(["u1"]);
  });

  it("flags an overlap with a tagged invitee in another department", () => {
    const result = computeClashes({
      candidate,
      events: [
        makeEvent({
          calendarId: "cal-2",
          calendarName: "HQ",
          start: instant("2026-08-17 09:30:00"),
          end: instant("2026-08-17 10:30:00"),
          people: { creatorId: "u3", userIds: [], departmentIds: [] },
        }),
      ],
      activeUsers: rosterUsers(),
    });
    expect(result.clashes).toHaveLength(1);
    expect(result.clashes[0].affectedUserIds).toEqual(["u3"]);
  });

  it("a department-level candidate clashes when a member is already busy", () => {
    const deptCandidate: ClashCandidateInput = {
      ...candidate,
      creatorId: "u1",
      inviteeUserIds: [],
      inviteeDepartments: ["cal-1"],
    };
    const result = computeClashes({
      candidate: deptCandidate,
      events: [
        makeEvent({
          start: instant("2026-08-17 09:00:00"),
          end: instant("2026-08-17 10:00:00"),
          people: { creatorId: "u2", userIds: [], departmentIds: [] },
        }),
      ],
      activeUsers: rosterUsers(),
    });
    expect(result.clashes).toHaveLength(1);
    expect(result.clashes[0].affectedUserIds).toEqual(["u2"]);
  });

  it("existing department-tagged events clash with an overlapping member event", () => {
    const result = computeClashes({
      candidate,
      events: [
        makeEvent({
          calendarId: "cal-1",
          calendarName: "Ops",
          start: instant("2026-08-17 09:00:00"),
          end: instant("2026-08-17 10:00:00"),
          people: { creatorId: "u2", userIds: [], departmentIds: ["cal-1"] },
        }),
      ],
      activeUsers: rosterUsers(),
    });
    // candidate u1 is a member of cal-1 -> double-booked with u2's dept event.
    expect(result.clashes).toHaveLength(1);
    expect(result.clashes[0].affectedUserIds).toEqual(["u1"]);
  });

  it("external events occupy members of their own calendar", () => {
    const result = computeClashes({
      candidate,
      events: [
        makeEvent({
          calendarId: "cal-2",
          calendarName: "HQ",
          external: true,
          start: instant("2026-08-17 09:00:00"),
          end: instant("2026-08-17 10:00:00"),
          people: { creatorId: null, userIds: [], departmentIds: [] },
        }),
      ],
      activeUsers: rosterUsers(),
    });
    expect(result.clashes).toHaveLength(1);
    expect(result.clashes[0].affectedUserIds).toEqual(["u3"]);
  });

  it("collapses multiple copies of the same logical event to one entry", () => {
    const result = computeClashes({
      candidate: { ...candidate, inviteeDepartments: ["cal-1", "cal-2"] },
      events: [
        makeEvent({
          calendarId: "cal-1",
          calendarName: "Ops",
          eventId: "grp-1",
          googleEventId: "g-a",
          start: instant("2026-08-17 09:00:00"),
          end: instant("2026-08-17 10:00:00"),
          people: { creatorId: "u2", userIds: [], departmentIds: ["cal-1", "cal-2"] },
        }),
        makeEvent({
          calendarId: "cal-2",
          calendarName: "HQ",
          eventId: "grp-1",
          googleEventId: "g-b",
          start: instant("2026-08-17 09:00:00"),
          end: instant("2026-08-17 10:00:00"),
          people: { creatorId: "u2", userIds: [], departmentIds: ["cal-1", "cal-2"] },
        }),
      ],
      activeUsers: rosterUsers(),
    });
    expect(result.clashes).toHaveLength(1);
    // Candidate includes everyone in cal-1 and cal-2 (u1, u2, u3, u4).
    expect(result.clashes[0].affectedUserIds.sort()).toEqual(["u1", "u2", "u3", "u4"]);
  });

  it("ignores events that overlap but share no people", () => {
    const result = computeClashes({
      candidate,
      events: [
        makeEvent({
          calendarId: "cal-2",
          calendarName: "HQ",
          start: instant("2026-08-17 09:00:00"),
          end: instant("2026-08-17 10:00:00"),
          people: { creatorId: "u4", userIds: [], departmentIds: [] },
        }),
      ],
      activeUsers: rosterUsers(),
    });
    expect(result.clashes).toEqual([]);
  });

  it("reports nothing when the roster membership is empty", () => {
    const result = computeClashes({
      candidate,
      events: [
        makeEvent({
          start: instant("2026-08-17 09:00:00"),
          end: instant("2026-08-17 10:00:00"),
          people: { creatorId: "u1", userIds: [], departmentIds: [] },
        }),
      ],
      activeUsers: [],
    });
    expect(result.clashes).toEqual([]);
    expect(result.checkedPeople).toBe(0);
  });

  it("orders results chronologically", () => {
    const result = computeClashes({
      candidate: {
        ...candidate,
        start: instant("2026-08-17 08:00:00"),
        end: instant("2026-08-17 20:00:00"),
        inviteeDepartments: ["cal-1"],
      },
      events: [
        makeEvent({
          googleEventId: "g-late",
          start: instant("2026-08-17 15:00:00"),
          end: instant("2026-08-17 16:00:00"),
          people: { creatorId: "u2", userIds: [], departmentIds: [] },
        }),
        makeEvent({
          googleEventId: "g-early",
          start: instant("2026-08-17 09:00:00"),
          end: instant("2026-08-17 10:00:00"),
          people: { creatorId: "u2", userIds: [], departmentIds: [] },
        }),
      ],
      activeUsers: rosterUsers(),
    });
    expect(result.clashes.map((c) => c.start.toISOString())).toEqual([
      instant("2026-08-17 09:00:00").toISOString(),
      instant("2026-08-17 15:00:00").toISOString(),
    ]);
  });
});
