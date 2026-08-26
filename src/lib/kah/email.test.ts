import { describe, expect, it } from "vitest";

import { buildKahBreachEmail, type KahBreachEmailGroup } from "./email";

const breach = (overrides: Partial<KahBreachEmailGroup> = {}): KahBreachEmailGroup => ({
  groupName: "Command",
  requiredPct: 60,
  actualPct: 40,
  totalMembers: 5,
  awayNames: ["Tan Wei Liang", "Lim Kah"],
  ...overrides,
});

describe("buildKahBreachEmail", () => {
  it("returns null when there are no breaches", () => {
    expect(
      buildKahBreachEmail({
        breaches: [],
        eventTitle: "Leave",
        actorName: "Admin",
        windowStart: new Date("2026-08-21T00:00:00Z"),
        windowEnd: new Date("2026-08-22T00:00:00Z"),
      }),
    ).toBeNull();
  });

  it("renders one combined message with per-group lines in UTC+8", () => {
    const email = buildKahBreachEmail({
      breaches: [
        breach(),
        breach({
          groupName: "Ops",
          requiredPct: 100,
          actualPct: 50,
          totalMembers: 2,
          awayNames: ["Ahmad Zaki"],
        }),
      ],
      eventTitle: "Overseas course",
      actorName: "Siti Nurul",
      windowStart: new Date("2026-08-20T16:00:00Z"),
      windowEnd: new Date("2026-08-21T02:30:00Z"),
    });

    expect(email?.subject).toBe("[cloudy2] KAH limit exceeded — Overseas course");
    expect(email?.body).toContain('After "Overseas course" was saved by Siti Nurul');
    expect(email?.body).toContain("- Command: 40% in country (3 of 5 members, required 60%) — away: Tan Wei Liang, Lim Kah");
    expect(email?.body).toContain("- Ops: 50% in country (1 of 2 members, required 100%) — away: Ahmad Zaki");
    // UTC+8 wall clock: 2026-08-20T16:00Z → 2026-08-21 00:00:00 local.
    expect(email?.body).toContain(
      "Event window: 2026-08-21 00:00:00 – 2026-08-21 10:30:00 (UTC+8)",
    );
    expect(email?.body).toContain("This is a notification only");
  });

  it("falls back to placeholders for blank titles/actors and empty away lists", () => {
    const email = buildKahBreachEmail({
      breaches: [breach({ awayNames: [] })],
      eventTitle: "   ",
      actorName: null,
      windowStart: new Date("2026-01-01T00:00:00Z"),
      windowEnd: new Date("2026-01-01T01:00:00Z"),
    });
    expect(email?.subject).toContain("Untitled event");
    expect(email?.body).toContain("saved by a user");
    expect(email?.body).toContain("away: (names unavailable)");
  });
});
