import { describe, expect, it } from "vitest";

import {
  buildClashDayStrip,
  clashCoveredDayKeys,
  clashDayKey,
  clashDayLabel,
  clashEntryTimeLabel,
  clashEpisodeTimeLabel,
  clashTimeLabel,
  clashTypeLabel,
  clashWhenLabel,
  formatAxisMinute,
  type ClashEntryDisplay,
  type ClashWindowLike,
} from "./clashDisplay";

function window(startNaive: string, endNaive: string, allDay = false): ClashWindowLike {
  return { startNaive, endNaive, allDay };
}

describe("clashDayKey", () => {
  it("returns the date part of a naive datetime or date", () => {
    expect(clashDayKey("2026-09-14 09:00:00")).toBe("2026-09-14");
    expect(clashDayKey("2026-09-14")).toBe("2026-09-14");
  });
});

describe("clashCoveredDayKeys", () => {
  it("returns one day for a same-day timed entry", () => {
    expect(
      clashCoveredDayKeys({
        effectiveStartNaive: "2026-09-15 09:00:00",
        effectiveEndNaive: "2026-09-15 10:00:00",
        occupiesFullDay: false,
      }),
    ).toEqual(["2026-09-15"]);
  });

  it("returns both days for a timed entry crossing midnight", () => {
    expect(
      clashCoveredDayKeys({
        effectiveStartNaive: "2026-09-15 22:00:00",
        effectiveEndNaive: "2026-09-16 02:00:00",
        occupiesFullDay: false,
      }),
    ).toEqual(["2026-09-15", "2026-09-16"]);
  });

  it("drops the exclusive end day for a whole-day entry", () => {
    expect(
      clashCoveredDayKeys({
        effectiveStartNaive: "2026-09-15 00:00:00",
        effectiveEndNaive: "2026-09-16 00:00:00",
        occupiesFullDay: true,
      }),
    ).toEqual(["2026-09-15"]);
  });

  it("spans every day for a multi-day whole-day entry", () => {
    expect(
      clashCoveredDayKeys({
        effectiveStartNaive: "2026-09-15 00:00:00",
        effectiveEndNaive: "2026-09-17 00:00:00",
        occupiesFullDay: true,
      }),
    ).toEqual(["2026-09-15", "2026-09-16"]);
  });
});

describe("clashDayLabel", () => {
  it("labels today and tomorrow", () => {
    expect(clashDayLabel("2026-09-14", "2026-09-14")).toBe("Today");
    expect(clashDayLabel("2026-09-15", "2026-09-14")).toBe("Tomorrow");
  });

  it("formats any other day as weekday + day + month", () => {
    expect(clashDayLabel("2026-09-21", "2026-09-14")).toBe("Mon 21 Sep");
  });

  it("crosses a month boundary for tomorrow", () => {
    expect(clashDayLabel("2026-10-01", "2026-09-30")).toBe("Tomorrow");
  });
});

describe("clashTimeLabel", () => {
  it("renders a same-day time range", () => {
    expect(clashTimeLabel(window("2026-09-14 09:00:00", "2026-09-14 11:30:00"))).toBe(
      "9:00 AM – 11:30 AM",
    );
  });

  it("renders All day for a single all-day window", () => {
    expect(clashTimeLabel(window("2026-09-14 00:00:00", "2026-09-14 00:00:00", true))).toBe(
      "All day",
    );
  });

  it("renders a date range for a multi-day all-day window", () => {
    expect(clashTimeLabel(window("2026-09-14 00:00:00", "2026-09-16 00:00:00", true))).toBe(
      "Sep 14 – Sep 16",
    );
  });

  it("qualifies the dates when the episode crosses days", () => {
    expect(clashTimeLabel(window("2026-09-14 09:00:00", "2026-09-15 10:00:00"))).toBe(
      "Sep 14, 9:00 AM – Sep 15, 10:00 AM",
    );
  });

  it("returns empty for a missing window", () => {
    expect(clashTimeLabel(window("", ""))).toBe("");
  });
});

describe("buildClashDayStrip", () => {
  it("returns one cell per day with conflict counts", () => {
    const strip = buildClashDayStrip("2026-09-14", "2026-09-17", [
      "2026-09-15",
      "2026-09-15",
      "2026-09-17",
    ]);
    expect(strip).toEqual([
      { dayKey: "2026-09-14", count: 0 },
      { dayKey: "2026-09-15", count: 2 },
      { dayKey: "2026-09-16", count: 0 },
      { dayKey: "2026-09-17", count: 1 },
    ]);
  });

  it("ignores conflict keys outside the range", () => {
    const strip = buildClashDayStrip("2026-09-14", "2026-09-15", ["2026-10-01"]);
    expect(strip.every((cell) => cell.count === 0)).toBe(true);
  });
});

describe("formatAxisMinute", () => {
  it("renders hour ticks in 12-hour form", () => {
    expect(formatAxisMinute(9 * 60)).toBe("9 AM");
    expect(formatAxisMinute(12 * 60)).toBe("12 PM");
    expect(formatAxisMinute(13 * 60)).toBe("1 PM");
    expect(formatAxisMinute(9 * 60 + 30)).toBe("9:30 AM");
  });
});

function entry(overrides: Partial<ClashEntryDisplay> = {}): ClashEntryDisplay {
  return {
    typeName: null,
    typeShortname: null,
    rawTitle: null,
    title: "Stored summary",
    startNaive: "2026-09-15 09:00:00",
    endNaive: "2026-09-15 10:00:00",
    allDay: false,
    occupiesFullDay: false,
    effectiveStartNaive: "2026-09-15 09:00:00",
    effectiveEndNaive: "2026-09-15 10:00:00",
    timeOption: "range",
    startAmPm: null,
    endAmPm: null,
    ...overrides,
  };
}

describe("clashTypeLabel", () => {
  it("prefers the type shortname, then name, then raw title, then title", () => {
    expect(
      clashTypeLabel({ typeShortname: "DSTA", typeName: "DSTA full", rawTitle: "Raw", title: "S" }),
    ).toBe("DSTA");
    expect(
      clashTypeLabel({ typeShortname: "", typeName: "DSTA full", rawTitle: "Raw", title: "S" }),
    ).toBe("DSTA full");
    expect(
      clashTypeLabel({ typeShortname: null, typeName: null, rawTitle: "Raw", title: "S" }),
    ).toBe("Raw");
    expect(
      clashTypeLabel({ typeShortname: null, typeName: null, rawTitle: null, title: "S" }),
    ).toBe("S");
  });
});

describe("clashEntryTimeLabel", () => {
  it("renders a date-free same-day time range", () => {
    expect(clashEntryTimeLabel(entry())).toBe("9:00 AM – 10:00 AM");
  });

  it("renders All day for whole-day events", () => {
    expect(clashEntryTimeLabel(entry({ occupiesFullDay: true }))).toBe("All day");
  });

  it("renders the half-of-day for a half-day event", () => {
    expect(
      clashEntryTimeLabel(
        entry({ timeOption: "half", startAmPm: "PM", endAmPm: "PM" }),
      ),
    ).toBe("PM");
  });

  it("qualifies the dates when the effective window crosses days", () => {
    expect(
      clashEntryTimeLabel(
        entry({
          effectiveStartNaive: "2026-09-15 22:00:00",
          effectiveEndNaive: "2026-09-16 02:00:00",
        }),
      ),
    ).toBe("Sep 15, 10:00 PM – Sep 16, 2:00 AM");
  });
});

describe("clashEpisodeTimeLabel", () => {
  it("spans the earliest start to the latest end", () => {
    expect(
      clashEpisodeTimeLabel([
        entry({ effectiveStartNaive: "2026-09-15 09:00:00", effectiveEndNaive: "2026-09-15 10:00:00" }),
        entry({ effectiveStartNaive: "2026-09-15 09:30:00", effectiveEndNaive: "2026-09-15 11:30:00" }),
      ]),
    ).toBe("9:00 AM – 11:30 AM");
  });

  it("reads All day for a single whole-day event (exclusive effective end)", () => {
    expect(
      clashEpisodeTimeLabel([
        entry({
          occupiesFullDay: true,
          effectiveStartNaive: "2026-09-15 00:00:00",
          effectiveEndNaive: "2026-09-16 00:00:00",
        }),
      ]),
    ).toBe("All day");
  });

  it("renders a date range for a multi-day all-day episode", () => {
    expect(
      clashEpisodeTimeLabel([
        entry({
          occupiesFullDay: true,
          effectiveStartNaive: "2026-09-15 00:00:00",
          effectiveEndNaive: "2026-09-16 00:00:00",
        }),
        entry({
          occupiesFullDay: true,
          effectiveStartNaive: "2026-09-16 00:00:00",
          effectiveEndNaive: "2026-09-17 00:00:00",
        }),
      ]),
    ).toBe("Sep 15 – Sep 16");
  });

  it("names both spans when a whole-day event mixes with a timed one", () => {
    expect(
      clashEpisodeTimeLabel([
        entry({
          occupiesFullDay: true,
          effectiveStartNaive: "2026-09-15 00:00:00",
          effectiveEndNaive: "2026-09-16 00:00:00",
        }),
        entry({ effectiveStartNaive: "2026-09-15 09:00:00", effectiveEndNaive: "2026-09-15 10:00:00" }),
      ]),
    ).toBe("9:00 AM – 10:00 AM · All day");
  });
});

describe("clashWhenLabel", () => {
  it("collapses a same-day timed range to one date", () => {
    expect(clashWhenLabel(window("2026-09-14 09:00:00", "2026-09-14 11:30:00"))).toBe(
      "Sep 14, 2026 9:00 AM – 11:30 AM",
    );
  });

  it("keeps both dates when a timed event crosses days", () => {
    expect(clashWhenLabel(window("2026-09-14 22:00:00", "2026-09-15 02:00:00"))).toBe(
      "Sep 14, 2026 10:00 PM – Sep 15, 2026 2:00 AM",
    );
  });

  it("renders a single all-day date without a repeated range", () => {
    expect(clashWhenLabel(window("2026-09-14 00:00:00", "2026-09-14 00:00:00", true))).toBe(
      "Sep 14, 2026",
    );
  });

  it("renders an all-day date range with the year only on the end", () => {
    expect(clashWhenLabel(window("2026-09-14 00:00:00", "2026-09-16 00:00:00", true))).toBe(
      "Sep 14 – Sep 16, 2026",
    );
  });

  it("returns empty for a missing start", () => {
    expect(clashWhenLabel(window("", ""))).toBe("");
  });
});
