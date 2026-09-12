import { describe, expect, it } from "vitest";

import {
  clashDayKey,
  clashDayLabel,
  clashEpisodeWindow,
  clashTimeLabel,
  clashWhenLabel,
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

describe("clashEpisodeWindow", () => {
  it("spans the earliest start to the latest end", () => {
    expect(
      clashEpisodeWindow([
        window("2026-09-14 09:00:00", "2026-09-14 10:00:00"),
        window("2026-09-14 09:30:00", "2026-09-14 11:30:00"),
      ]),
    ).toEqual(window("2026-09-14 09:00:00", "2026-09-14 11:30:00"));
  });

  it("normalizes an all-day end to end-of-day so a mixed span is correct", () => {
    expect(
      clashEpisodeWindow([
        window("2026-09-14 00:00:00", "2026-09-14 00:00:00", true),
        window("2026-09-14 09:00:00", "2026-09-14 10:00:00"),
      ]),
    ).toEqual(window("2026-09-14 00:00:00", "2026-09-14 23:59:59"));
  });

  it("is all-day only when every entry is all-day", () => {
    expect(
      clashEpisodeWindow([
        window("2026-09-14 00:00:00", "2026-09-14 00:00:00", true),
        window("2026-09-14 00:00:00", "2026-09-14 00:00:00", true),
      ]).allDay,
    ).toBe(true);
    expect(
      clashEpisodeWindow([
        window("2026-09-14 00:00:00", "2026-09-14 00:00:00", true),
        window("2026-09-14 09:00:00", "2026-09-14 10:00:00"),
      ]).allDay,
    ).toBe(false);
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
