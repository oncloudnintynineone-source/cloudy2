import { describe, expect, it } from "vitest";

import { buildClashTimeline, type ClashTimelineInput } from "./clashTimeline";

const DAY = "2026-09-15";

function timed(start: string, end: string): ClashTimelineInput {
  return { startNaive: `${DAY} ${start}`, endNaive: `${DAY} ${end}`, occupiesFullDay: false };
}

describe("buildClashTimeline", () => {
  it("places a single event on the axis with hour-snapped bounds", () => {
    const timeline = buildClashTimeline([timed("09:00:00", "10:00:00")], DAY);
    expect(timeline.allDayIndices).toEqual([]);
    expect(timeline.bars).toHaveLength(1);
    expect(timeline.bars[0].lane).toBe(0);
    expect(timeline.laneCount).toBe(1);
    expect(timeline.axisStartMinute).toBe(8 * 60);
    expect(timeline.axisEndMinute).toBe(10 * 60);
  });

  it("stacks overlapping events into separate lanes", () => {
    const timeline = buildClashTimeline(
      [timed("09:00:00", "11:00:00"), timed("10:00:00", "12:00:00")],
      DAY,
    );
    expect(timeline.laneCount).toBe(2);
    expect(timeline.bars.map((bar) => bar.lane)).toEqual([0, 1]);
  });

  it("keeps non-overlapping events in the same lane", () => {
    const timeline = buildClashTimeline(
      [timed("09:00:00", "10:00:00"), timed("11:00:00", "12:00:00")],
      DAY,
    );
    expect(timeline.laneCount).toBe(1);
    expect(timeline.bars.map((bar) => bar.lane)).toEqual([0, 0]);
  });

  it("marks the overlap band between two bars", () => {
    const timeline = buildClashTimeline(
      [timed("09:00:00", "11:00:00"), timed("10:00:00", "12:00:00")],
      DAY,
    );
    expect(timeline.overlapBands).toHaveLength(1);
    // Overlap is 10:00–11:00 within an axis of 09:00–12:00 (180 min).
    expect(timeline.overlapBands[0].leftPct).toBeCloseTo((60 / 180) * 100, 5);
    expect(timeline.overlapBands[0].widthPct).toBeCloseTo((60 / 180) * 100, 5);
  });

  it("separates whole-day events from the axis", () => {
    const timeline = buildClashTimeline(
      [
        { startNaive: `${DAY} 00:00:00`, endNaive: "2026-09-16 00:00:00", occupiesFullDay: true },
        timed("09:00:00", "10:00:00"),
      ],
      DAY,
    );
    expect(timeline.allDayIndices).toEqual([0]);
    expect(timeline.bars.map((bar) => bar.index)).toEqual([1]);
  });

  it("clamps an event that spans the day to the full axis", () => {
    const timeline = buildClashTimeline(
      [{ startNaive: "2026-09-14 22:00:00", endNaive: `${DAY} 02:00:00`, occupiesFullDay: false }],
      DAY,
    );
    expect(timeline.bars[0].leftPct).toBe(0);
    expect(timeline.bars[0].widthPct).toBe(100);
  });

  it("gives a zero-length instant a visible minimum width", () => {
    const timeline = buildClashTimeline([timed("09:30:00", "09:30:00")], DAY);
    expect(timeline.bars[0].widthPct).toBeGreaterThan(0);
    expect(timeline.bars[0].leftPct).toBeGreaterThanOrEqual(0);
  });

  it("returns a default axis when there are only whole-day events", () => {
    const timeline = buildClashTimeline(
      [{ startNaive: `${DAY} 00:00:00`, endNaive: "2026-09-16 00:00:00", occupiesFullDay: true }],
      DAY,
    );
    expect(timeline.bars).toEqual([]);
    expect(timeline.laneCount).toBe(0);
    expect(timeline.axisStartMinute).toBe(8 * 60);
    expect(timeline.axisEndMinute).toBe(18 * 60);
    expect(timeline.overlapBands).toEqual([]);
  });

  it("keeps bar percentages within the axis", () => {
    const timeline = buildClashTimeline(
      [timed("09:00:00", "17:00:00"), timed("09:30:00", "09:30:00"), timed("13:00:00", "15:00:00")],
      DAY,
    );
    for (const bar of timeline.bars) {
      expect(bar.leftPct).toBeGreaterThanOrEqual(0);
      expect(bar.leftPct + bar.widthPct).toBeLessThanOrEqual(100.0001);
    }
  });
});
