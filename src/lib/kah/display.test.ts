import { describe, expect, it } from "vitest";

import { awaySpanLabel, awaySpanSummary, groupStateLabel, periodLabel } from "./display";

describe("periodLabel", () => {
  it("names a plain run's dates", () => {
    expect(
      periodLabel({
        startDate: "2026-09-12",
        endDate: "2026-09-16",
        clippedStart: false,
        clippedEnd: false,
      }),
    ).toBe("Sep 12 – Sep 16");
  });

  it("marks a run clipped at either edge of the window", () => {
    expect(
      periodLabel({
        startDate: "2026-09-12",
        endDate: "2026-10-31",
        clippedStart: true,
        clippedEnd: true,
      }),
    ).toBe("Ongoing – Oct 31+");
  });

  it("adds the year when the run crosses one", () => {
    expect(
      periodLabel({
        startDate: "2026-12-28",
        endDate: "2027-01-03",
        clippedStart: false,
        clippedEnd: false,
      }),
    ).toBe("Dec 28, 2026 – Jan 3, 2027");
  });
});

describe("groupStateLabel", () => {
  it("uses the three card states", () => {
    expect(groupStateLabel("active")).toBe("Breaching now");
    expect(groupStateLabel("upcoming")).toBe("Breach upcoming");
    expect(groupStateLabel("clear")).toBe("All clear");
  });
});

describe("awaySpanLabel", () => {
  const today = "2026-09-14";

  it("names a one-day trip", () => {
    expect(awaySpanLabel({ startDate: "2026-09-20", endDate: "2026-09-20" }, today)).toBe(
      "Next away Sep 20",
    );
  });

  it("names a future multi-day trip", () => {
    expect(awaySpanLabel({ startDate: "2026-09-20", endDate: "2026-09-24" }, today)).toBe(
      "Next away Sep 20 – Sep 24",
    );
  });

  it("reads the current trip as away now, with its return day", () => {
    expect(awaySpanLabel({ startDate: "2026-09-12", endDate: "2026-09-16" }, today)).toBe(
      "Away now · until Sep 16",
    );
  });

  it("singles out a trip that is only today", () => {
    expect(awaySpanLabel({ startDate: today, endDate: today }, today)).toBe("Away today");
  });

  it("adds the year when the trip crosses one", () => {
    expect(awaySpanLabel({ startDate: "2026-12-30", endDate: "2027-01-02" }, today)).toBe(
      "Next away Dec 30, 2026 – Jan 2, 2027",
    );
  });
});

describe("awaySpanSummary", () => {
  const today = "2026-09-14";

  it("returns null when every trip is in the past", () => {
    expect(awaySpanSummary([{ startDate: "2026-09-01", endDate: "2026-09-03" }], today)).toBeNull();
  });

  it("names the current trip first and counts later ones", () => {
    expect(
      awaySpanSummary(
        [
          { startDate: "2026-09-12", endDate: "2026-09-16" },
          { startDate: "2026-10-01", endDate: "2026-10-02" },
          { startDate: "2026-11-05", endDate: "2026-11-06" },
        ],
        today,
      ),
    ).toEqual({ label: "Away now · until Sep 16", more: 2 });
  });
});
