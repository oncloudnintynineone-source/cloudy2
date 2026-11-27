import { describe, expect, it } from "vitest";

import { addOneDay, parseNaiveToInstant } from "@/lib/events/datetime";

import {
  awaySpansByMember,
  breachDaysByGroup,
  groupBreachState,
  groupNextBreachDate,
  groupWorst,
} from "./groups";

/** Build an event-like window from naive UTC+8 bounds (`YYYY-MM-DD HH:mm:ss`). */
function event(
  userIds: string[],
  startNaive: string,
  endNaive: string,
): { userIds: string[]; start: Date; end: Date } {
  return {
    userIds,
    start: parseNaiveToInstant(startNaive),
    end: parseNaiveToInstant(endNaive),
  };
}

describe("awaySpansByMember", () => {
  it("converts half-open event windows to inclusive civil days", () => {
    const spans = awaySpansByMember(
      [event(["u1"], "2026-09-12 00:00:00", "2026-09-15 00:00:00")],
      ["u1"],
      "2026-09-01",
      "2026-09-30",
    );
    // Exclusive end on the 15th means the 12th–14th are away days.
    expect(spans.get("u1")).toEqual([{ startDate: "2026-09-12", endDate: "2026-09-14" }]);
  });

  it("merges overlapping and back-to-back trips into one stretch", () => {
    const spans = awaySpansByMember(
      [
        event(["u1"], "2026-09-12 00:00:00", "2026-09-15 00:00:00"),
        event(["u1"], "2026-09-13 00:00:00", "2026-09-17 00:00:00"),
        event(["u1"], "2026-09-17 00:00:00", "2026-09-19 00:00:00"),
      ],
      ["u1"],
      "2026-09-01",
      "2026-09-30",
    );
    expect(spans.get("u1")).toEqual([{ startDate: "2026-09-12", endDate: "2026-09-18" }]);
  });

  it("keeps a genuine gap as two stretches, in date order", () => {
    const spans = awaySpansByMember(
      [
        event(["u1"], "2026-09-20 00:00:00", "2026-09-22 00:00:00"),
        event(["u1"], "2026-09-12 00:00:00", "2026-09-14 00:00:00"),
      ],
      ["u1"],
      "2026-09-01",
      "2026-09-30",
    );
    expect(spans.get("u1")).toEqual([
      { startDate: "2026-09-12", endDate: "2026-09-13" },
      { startDate: "2026-09-20", endDate: "2026-09-21" },
    ]);
  });

  it("clips a trip to both window edges", () => {
    const spans = awaySpansByMember(
      [event(["u1"], "2026-08-20 00:00:00", "2026-10-05 00:00:00")],
      ["u1"],
      "2026-09-22",
      "2026-10-31",
    );
    expect(spans.get("u1")).toEqual([{ startDate: "2026-09-22", endDate: "2026-10-04" }]);
  });

  it("ignores events that end before the window starts", () => {
    const spans = awaySpansByMember(
      [event(["u1"], "2026-09-01 00:00:00", "2026-09-22 00:00:00")],
      ["u1"],
      "2026-09-22",
      "2026-09-30",
    );
    // Ends exactly at the window's first instant → no overlap (half-open).
    expect(spans.size).toBe(0);
  });

  it("reports each member separately and omits untagged people", () => {
    const spans = awaySpansByMember(
      [event(["u1", "u2", "outsider"], "2026-09-12 00:00:00", "2026-09-13 00:00:00")],
      ["u1", "u2"],
      "2026-09-01",
      "2026-09-30",
    );
    expect(spans.get("u1")).toEqual([{ startDate: "2026-09-12", endDate: "2026-09-12" }]);
    expect(spans.get("u2")).toEqual([{ startDate: "2026-09-12", endDate: "2026-09-12" }]);
    expect(spans.has("outsider")).toBe(false);
  });

  it("handles an empty member list without scanning", () => {
    expect(
      awaySpansByMember(
        [event(["u1"], "2026-09-12 00:00:00", "2026-09-13 00:00:00")],
        [],
        "2026-09-01",
        "2026-09-30",
      ).size,
    ).toBe(0);
  });

  it("merges a trip that starts the day after another ends", () => {
    const first = "2026-09-12";
    const next = addOneDay("2026-09-14");
    expect(next).toBe("2026-09-15");
    const spans = awaySpansByMember(
      [
        event(["u1"], "2026-09-12 00:00:00", "2026-09-14 00:00:00"),
        event(["u1"], "2026-09-14 00:00:00", "2026-09-16 00:00:00"),
      ],
      ["u1"],
      "2026-09-01",
      "2026-09-30",
    );
    expect(first).toBe("2026-09-12");
    expect(spans.get("u1")).toEqual([{ startDate: "2026-09-12", endDate: "2026-09-15" }]);
  });
});

describe("groupBreachState", () => {
  it("prefers an active run over upcoming ones", () => {
    expect(groupBreachState([{ status: "upcoming" }, { status: "active" }])).toBe("active");
  });

  it("reports upcoming when no run includes today", () => {
    expect(groupBreachState([{ status: "upcoming" }])).toBe("upcoming");
  });

  it("reports clear for no runs", () => {
    expect(groupBreachState([])).toBe("clear");
  });
});

describe("groupWorst", () => {
  it("keeps the lowest percentage and the earliest day on a tie", () => {
    expect(
      groupWorst([
        { worstPct: 40, worstDate: "2026-09-14" },
        { worstPct: 20, worstDate: "2026-10-02" },
        { worstPct: 20, worstDate: "2026-09-30" },
      ]),
    ).toEqual({ pct: 20, date: "2026-09-30" });
  });

  it("returns null when the group never breached", () => {
    expect(groupWorst([])).toBeNull();
  });
});

describe("groupNextBreachDate", () => {
  it("returns the earliest non-resolved run start", () => {
    expect(
      groupNextBreachDate([
        { status: "resolved", startDate: "2026-09-01" },
        { status: "upcoming", startDate: "2026-11-02" },
        { status: "upcoming", startDate: "2026-10-05" },
      ]),
    ).toBe("2026-10-05");
  });

  it("returns null when clear", () => {
    expect(groupNextBreachDate([])).toBeNull();
  });
});

describe("breachDaysByGroup", () => {
  it("collects only breached days, chronological, keyed by group", () => {
    const perDay = [
      {
        date: "2026-09-28",
        statuses: [
          { groupId: "g1", breached: true },
          { groupId: "g2", breached: false },
        ],
      },
      {
        date: "2026-09-29",
        statuses: [
          { groupId: "g1", breached: true },
          { groupId: "g2", breached: true },
        ],
      },
      {
        date: "2026-09-30",
        statuses: [
          { groupId: "g1", breached: false },
          { groupId: "g2", breached: true },
        ],
      },
      {
        date: "2026-10-01",
        statuses: [
          { groupId: "g1", breached: true },
          { groupId: "g2", breached: false },
        ],
      },
    ];
    const byGroup = breachDaysByGroup(perDay);
    expect(byGroup.get("g1")).toEqual(["2026-09-28", "2026-09-29", "2026-10-01"]);
    expect(byGroup.get("g2")).toEqual(["2026-09-29", "2026-09-30"]);
  });

  it("omits groups with no breached day", () => {
    const byGroup = breachDaysByGroup([
      { date: "2026-09-28", statuses: [{ groupId: "g1", breached: false }] },
    ]);
    expect(byGroup.size).toBe(0);
  });

  it("handles an empty scan", () => {
    expect(breachDaysByGroup([]).size).toBe(0);
  });
});
