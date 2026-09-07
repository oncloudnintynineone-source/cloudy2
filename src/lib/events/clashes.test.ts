import { describe, expect, it } from "vitest";

import {
  busyUsersOfEvent,
  candidateUsers,
  computeClashes,
  findUserClashGroups,
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

  it("does not occupy a creator who did not self-invite", () => {
    const event = makeEvent({
      start: instant("2026-08-17 09:00:00"),
      end: instant("2026-08-17 10:00:00"),
      people: { creatorId: "u9", userIds: [], departmentIds: [] },
    });
    expect([...busyUsersOfEvent(event, members)]).toEqual([]);
  });

  it("occupies a creator who tagged themselves as an attendee", () => {
    const event = makeEvent({
      start: instant("2026-08-17 09:00:00"),
      end: instant("2026-08-17 10:00:00"),
      people: { creatorId: "u1", userIds: ["u1"], departmentIds: [] },
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
      people: { creatorId: "u1", userIds: ["u1"], departmentIds: ["cal-missing"] },
    });
    expect([...busyUsersOfEvent(event, members)]).toEqual(["u1"]);
  });
});

describe("candidateUsers", () => {
  const members = roster([
    { id: "u1", departmentId: "cal-1" },
    { id: "u2", departmentId: "cal-1" },
  ]);

  it("includes tagged users and members of tagged departments", () => {
    const candidate: ClashCandidateInput = {
      start: instant("2026-08-17 09:00:00"),
      end: instant("2026-08-17 10:00:00"),
      creatorId: "u1",
      inviteeUserIds: ["u3"],
      inviteeDepartments: ["cal-1"],
    };
    const active = new Set(["u1", "u2", "u3"]);
    const users = candidateUsers(candidate, active, members);
    // u1 is occupied only because it is a member of the tagged cal-1, not
    // because it is the creator.
    expect([...users.keys()].sort()).toEqual(["u1", "u2", "u3"]);
    expect(users.get("u1")).toBe("cal-1");
    expect(users.get("u2")).toBe("cal-1");
    expect(users.get("u3")).toBeNull();
  });

  it("does not count a creator who did not self-invite", () => {
    const candidate: ClashCandidateInput = {
      start: instant("2026-08-17 09:00:00"),
      end: instant("2026-08-17 10:00:00"),
      creatorId: "u1",
      inviteeUserIds: [],
      inviteeDepartments: [],
    };
    expect(candidateUsers(candidate, new Set(["u1"]), members).size).toBe(0);
  });

  it("drops explicit users not on the active roster", () => {
    const candidate: ClashCandidateInput = {
      start: instant("2026-08-17 09:00:00"),
      end: instant("2026-08-17 10:00:00"),
      creatorId: "u1",
      inviteeUserIds: ["u1", "ghost"],
      inviteeDepartments: [],
    };
    const users = candidateUsers(candidate, new Set(["u1"]), members);
    expect([...users.keys()]).toEqual(["u1"]);
  });
});

describe("computeClashes", () => {
  // Creator u1 self-invited (attending), plus tagged u3.
  const candidate: ClashCandidateInput = {
    start: instant("2026-08-17 09:00:00"),
    end: instant("2026-08-17 11:00:00"),
    creatorId: "u1",
    inviteeUserIds: ["u1", "u3"],
    inviteeDepartments: [],
  };

  it("returns no clashes when nothing overlaps", () => {
    const result = computeClashes({
      candidate,
      events: [
        makeEvent({
          start: instant("2026-08-17 11:00:00"),
          end: instant("2026-08-17 12:00:00"),
          people: { creatorId: "u1", userIds: ["u1"], departmentIds: [] },
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
          people: { creatorId: "u1", userIds: ["u1"], departmentIds: [] },
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
          people: { creatorId: "u3", userIds: ["u3"], departmentIds: [] },
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
          people: { creatorId: "u2", userIds: ["u2"], departmentIds: [] },
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
          people: { creatorId: "u4", userIds: ["u4"], departmentIds: [] },
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
          people: { creatorId: "u1", userIds: ["u1"], departmentIds: [] },
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
          people: { creatorId: "u2", userIds: ["u2"], departmentIds: [] },
        }),
        makeEvent({
          googleEventId: "g-early",
          start: instant("2026-08-17 09:00:00"),
          end: instant("2026-08-17 10:00:00"),
          people: { creatorId: "u2", userIds: ["u2"], departmentIds: [] },
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

describe("findUserClashGroups", () => {
  const scan = (targetUserId: string, events: ClashEventInput[]) =>
    findUserClashGroups({ targetUserId, events, activeUsers: rosterUsers() });

  it("returns no groups when nothing occupies the target or nothing overlaps", () => {
    const result = scan("u1", [
      makeEvent({
        start: instant("2026-08-17 09:00:00"),
        end: instant("2026-08-17 10:00:00"),
        people: { creatorId: "u2", userIds: ["u2"], departmentIds: [] },
      }),
    ]);
    expect(result.groups).toEqual([]);
  });

  it("flags two overlapping events that both occupy the target", () => {
    const result = scan("u1", [
      makeEvent({
        googleEventId: "g-1",
        start: instant("2026-08-17 09:00:00"),
        end: instant("2026-08-17 10:00:00"),
        people: { creatorId: "u1", userIds: ["u1"], departmentIds: [] },
      }),
      makeEvent({
        googleEventId: "g-2",
        start: instant("2026-08-17 09:30:00"),
        end: instant("2026-08-17 10:30:00"),
        people: { creatorId: "u2", userIds: [], departmentIds: ["cal-1"] },
      }),
    ]);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].events.map((e) => e.googleEventId)).toEqual(["g-1", "g-2"]);
    expect(result.groups[0].sharedUserIds).toEqual(["u1"]);
  });

  it("a tagged user in another department double-books the target", () => {
    const result = scan("u1", [
      makeEvent({
        googleEventId: "g-1",
        start: instant("2026-08-17 09:00:00"),
        end: instant("2026-08-17 10:00:00"),
        people: { creatorId: "u1", userIds: ["u1"], departmentIds: [] },
      }),
      makeEvent({
        calendarId: "cal-2",
        calendarName: "HQ",
        googleEventId: "g-2",
        start: instant("2026-08-17 09:00:00"),
        end: instant("2026-08-17 10:00:00"),
        people: { creatorId: "u3", userIds: ["u1"], departmentIds: [] },
      }),
    ]);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].sharedUserIds).toEqual(["u1"]);
  });

  it("external events on the target's calendar count towards occupancy", () => {
    const result = scan("u1", [
      makeEvent({
        googleEventId: "g-1",
        start: instant("2026-08-17 09:00:00"),
        end: instant("2026-08-17 10:00:00"),
        people: { creatorId: "u1", userIds: ["u1"], departmentIds: [] },
      }),
      makeEvent({
        googleEventId: "g-ext",
        external: true,
        start: instant("2026-08-17 09:30:00"),
        end: instant("2026-08-17 10:30:00"),
        people: { creatorId: null, userIds: [], departmentIds: [] },
      }),
    ]);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].sharedUserIds).toEqual(["u1"]);
  });

  it("ignores an overlapping event that does not occupy the target", () => {
    const result = scan("u1", [
      makeEvent({
        googleEventId: "g-1",
        start: instant("2026-08-17 09:00:00"),
        end: instant("2026-08-17 10:00:00"),
        people: { creatorId: "u1", userIds: ["u1"], departmentIds: [] },
      }),
      makeEvent({
        googleEventId: "g-other",
        start: instant("2026-08-17 09:00:00"),
        end: instant("2026-08-17 10:00:00"),
        people: { creatorId: "u2", userIds: ["u2"], departmentIds: [] },
      }),
    ]);
    expect(result.groups).toEqual([]);
  });

  it("keeps two separate clash episodes as two groups in order", () => {
    const result = scan("u1", [
      makeEvent({
        googleEventId: "g-am2",
        start: instant("2026-08-17 09:30:00"),
        end: instant("2026-08-17 10:30:00"),
        people: { creatorId: "u1", userIds: ["u1"], departmentIds: [] },
      }),
      makeEvent({
        googleEventId: "g-am1",
        start: instant("2026-08-17 09:00:00"),
        end: instant("2026-08-17 10:00:00"),
        people: { creatorId: "u2", userIds: [], departmentIds: ["cal-1"] },
      }),
      makeEvent({
        googleEventId: "g-pm1",
        start: instant("2026-08-17 15:00:00"),
        end: instant("2026-08-17 16:00:00"),
        people: { creatorId: "u1", userIds: ["u1"], departmentIds: [] },
      }),
      makeEvent({
        googleEventId: "g-pm2",
        start: instant("2026-08-17 15:30:00"),
        end: instant("2026-08-17 16:30:00"),
        people: { creatorId: "u1", userIds: ["u1"], departmentIds: [] },
      }),
    ]);
    expect(result.groups).toHaveLength(2);
    expect(result.groups[0].events[0].googleEventId).toBe("g-am1");
    expect(result.groups[1].events[0].googleEventId).toBe("g-pm1");
  });

  it("groups an overlap chain A-B-C as one episode", () => {
    const result = scan("u1", [
      makeEvent({
        googleEventId: "g-a",
        start: instant("2026-08-17 09:00:00"),
        end: instant("2026-08-17 10:00:00"),
        people: { creatorId: "u1", userIds: ["u1"], departmentIds: [] },
      }),
      makeEvent({
        googleEventId: "g-b",
        start: instant("2026-08-17 09:30:00"),
        end: instant("2026-08-17 11:00:00"),
        people: { creatorId: "u1", userIds: ["u1"], departmentIds: [] },
      }),
      makeEvent({
        googleEventId: "g-c",
        start: instant("2026-08-17 10:30:00"),
        end: instant("2026-08-17 12:00:00"),
        people: { creatorId: "u1", userIds: ["u1"], departmentIds: [] },
      }),
    ]);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].events.map((e) => e.googleEventId)).toEqual(["g-a", "g-b", "g-c"]);
    expect(result.groups[0].sharedUserIds).toEqual(["u1"]);
  });

  it("back-to-back occupying events do not clash", () => {
    const result = scan("u1", [
      makeEvent({
        googleEventId: "g-1",
        start: instant("2026-08-17 09:00:00"),
        end: instant("2026-08-17 10:00:00"),
        people: { creatorId: "u1", userIds: ["u1"], departmentIds: [] },
      }),
      makeEvent({
        googleEventId: "g-2",
        start: instant("2026-08-17 10:00:00"),
        end: instant("2026-08-17 11:00:00"),
        people: { creatorId: "u1", userIds: ["u1"], departmentIds: [] },
      }),
    ]);
    expect(result.groups).toEqual([]);
  });

  it("collapses logical copies of the same event before grouping", () => {
    const result = scan("u1", [
      makeEvent({
        calendarId: "cal-1",
        calendarName: "Ops",
        eventId: "grp-1",
        googleEventId: "g-a",
        start: instant("2026-08-17 09:00:00"),
        end: instant("2026-08-17 10:00:00"),
        people: { creatorId: "u1", userIds: ["u1"], departmentIds: ["cal-2"] },
      }),
      makeEvent({
        calendarId: "cal-2",
        calendarName: "HQ",
        eventId: "grp-1",
        googleEventId: "g-b",
        start: instant("2026-08-17 09:00:00"),
        end: instant("2026-08-17 10:00:00"),
        people: { creatorId: "u1", userIds: ["u1"], departmentIds: ["cal-2"] },
      }),
      makeEvent({
        googleEventId: "g-2",
        start: instant("2026-08-17 09:30:00"),
        end: instant("2026-08-17 10:30:00"),
        people: { creatorId: "u2", userIds: [], departmentIds: ["cal-1"] },
      }),
    ]);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].events.map((e) => e.googleEventId)).toEqual(["g-a", "g-2"]);
    expect(result.groups[0].sharedUserIds).toEqual(["u1"]);
  });

  it("returns nothing when the target is not on the active roster", () => {
    const result = scan("ghost", [
      makeEvent({
        start: instant("2026-08-17 09:00:00"),
        end: instant("2026-08-17 10:00:00"),
        people: { creatorId: "ghost", userIds: ["ghost"], departmentIds: [] },
      }),
    ]);
    expect(result.groups).toEqual([]);
  });

  it("shared users are those occupied by every event in the group", () => {
    const result = scan("u1", [
      makeEvent({
        googleEventId: "g-1",
        start: instant("2026-08-17 09:00:00"),
        end: instant("2026-08-17 10:00:00"),
        people: { creatorId: "u1", userIds: ["u1", "u2"], departmentIds: [] },
      }),
      makeEvent({
        googleEventId: "g-2",
        start: instant("2026-08-17 09:30:00"),
        end: instant("2026-08-17 10:30:00"),
        people: { creatorId: "u1", userIds: ["u1", "u2"], departmentIds: [] },
      }),
    ]);
    expect(result.groups[0].sharedUserIds).toEqual(["u1", "u2"]);
  });
});
