/**
 * Pure geometry for the Double Booking "conflict timeline" card: given a day's
 * episode events, position each event's effective occupancy window on a shared
 * time axis, pack overlapping bars into lanes, and mark the overlap bands.
 * I/O-free and unit-tested (`clashTimeline.test.ts`); the visual lives in
 * `src/components/clashTimeline.tsx`. See docs/user-clashes.md §1.8.
 */

const MINUTES_PER_DAY = 24 * 60;
/** A zero-length/instant event still gets a visible bar. */
const MIN_BAR_MINUTES = 15;
/** The axis never renders narrower than this, so a single short event is legible. */
const MIN_AXIS_MINUTES = 2 * 60;
/** Fallback axis when an episode has no timed bars. */
const DEFAULT_AXIS_START = 8 * 60;
const DEFAULT_AXIS_END = 18 * 60;

export interface ClashTimelineInput {
  /** Effective occupancy start, naive UTC+8 `YYYY-MM-DD HH:mm:ss`. */
  startNaive: string;
  /** Effective occupancy end (exclusive), naive UTC+8. */
  endNaive: string;
  /** Whole-day occupancy — rendered in a separate band, not on the axis. */
  occupiesFullDay: boolean;
}

export interface ClashTimelineBar {
  /** Index into the input array. */
  index: number;
  /** Stacking lane (0 = top). */
  lane: number;
  /** Percent of the axis width. */
  leftPct: number;
  widthPct: number;
}

export interface ClashOverlapBand {
  leftPct: number;
  widthPct: number;
}

export interface ClashTimeline {
  /** Input indices of whole-day events, in input order. */
  allDayIndices: number[];
  /** Timed bars, lane-packed. */
  bars: ClashTimelineBar[];
  /** Number of lanes used (>= 1 when there are timed bars). */
  laneCount: number;
  /** Axis bounds, minutes from the reference day's midnight. */
  axisStartMinute: number;
  axisEndMinute: number;
  /** Hour tick minutes across the axis. */
  ticks: number[];
  /** Regions covered by two or more timed bars. */
  overlapBands: ClashOverlapBand[];
}

function dayIndex(dateOnly: string): number {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function minutesOfDay(naive: string): number {
  const [hours, minutes] = naive.slice(11, 16).split(":").map(Number);
  return hours * 60 + minutes;
}

/** Minutes from the reference day's midnight; may be negative or > 1440. */
function axisMinutes(naive: string, dayKey: string): number {
  return (dayIndex(naive.slice(0, 10)) - dayIndex(dayKey)) * MINUTES_PER_DAY + minutesOfDay(naive);
}

function snapAxis(start: number, end: number): { start: number; end: number } {
  let axisStart = Math.floor(start / 60) * 60;
  let axisEnd = Math.ceil(end / 60) * 60;
  if (axisEnd - axisStart < MIN_AXIS_MINUTES) {
    const pad = (MIN_AXIS_MINUTES - (axisEnd - axisStart)) / 2;
    axisStart = Math.floor((axisStart - pad) / 60) * 60;
    axisEnd = axisStart + MIN_AXIS_MINUTES;
  }
  return { start: Math.max(0, axisStart), end: Math.min(MINUTES_PER_DAY, axisEnd) };
}

function buildTicks(axisStart: number, axisEnd: number): number[] {
  const span = axisEnd - axisStart;
  const step = span > 8 * 60 ? 120 : 60;
  const ticks: number[] = [];
  for (let minute = Math.ceil(axisStart / step) * step; minute <= axisEnd; minute += step) {
    ticks.push(minute);
  }
  return ticks;
}

/** Regions where >= 2 intervals overlap, as axis-minute [start, end) pairs. */
function overlapRegions(
  intervals: readonly { start: number; end: number }[],
): { start: number; end: number }[] {
  const edges: { minute: number; delta: number }[] = [];
  for (const { start, end } of intervals) {
    edges.push({ minute: start, delta: 1 });
    edges.push({ minute: end, delta: -1 });
  }
  edges.sort((a, b) => a.minute - b.minute || a.delta - b.delta);
  const regions: { start: number; end: number }[] = [];
  let depth = 0;
  let regionStart = 0;
  for (const edge of edges) {
    const wasDeep = depth >= 2;
    depth += edge.delta;
    const isDeep = depth >= 2;
    if (!wasDeep && isDeep) {
      regionStart = edge.minute;
    } else if (wasDeep && !isDeep && edge.minute > regionStart) {
      regions.push({ start: regionStart, end: edge.minute });
    }
  }
  return regions;
}

/**
 * Build the timeline for one episode day. `dayKey` is the `YYYY-MM-DD` the card
 * is filed under; events that start before or end after it are clamped to the
 * day (a bar running to the edge reads as "continues").
 */
export function buildClashTimeline(
  entries: readonly ClashTimelineInput[],
  dayKey: string,
): ClashTimeline {
  const allDayIndices: number[] = [];
  const intervals: { index: number; start: number; end: number }[] = [];

  entries.forEach((entry, index) => {
    if (entry.occupiesFullDay) {
      allDayIndices.push(index);
      return;
    }
    const rawStart = axisMinutes(entry.startNaive, dayKey);
    const rawEnd = axisMinutes(entry.endNaive, dayKey);
    let start = Math.max(0, Math.min(MINUTES_PER_DAY, rawStart));
    let end = Math.max(0, Math.min(MINUTES_PER_DAY, rawEnd));
    if (end - start < MIN_BAR_MINUTES) {
      end = start + MIN_BAR_MINUTES;
      if (end > MINUTES_PER_DAY) {
        end = MINUTES_PER_DAY;
        start = Math.max(0, end - MIN_BAR_MINUTES);
      }
    }
    intervals.push({ index, start, end });
  });

  if (intervals.length === 0) {
    const axis = { start: DEFAULT_AXIS_START, end: DEFAULT_AXIS_END };
    return {
      allDayIndices,
      bars: [],
      laneCount: 0,
      axisStartMinute: axis.start,
      axisEndMinute: axis.end,
      ticks: buildTicks(axis.start, axis.end),
      overlapBands: [],
    };
  }

  const { start: axisStart, end: axisEnd } = snapAxis(
    Math.min(...intervals.map((interval) => interval.start)),
    Math.max(...intervals.map((interval) => interval.end)),
  );
  const span = axisEnd - axisStart;

  // Greedy interval partitioning: first lane whose last bar ends by this start.
  const laneEnds: number[] = [];
  const sorted = [...intervals].sort(
    (a, b) => a.start - b.start || a.end - b.end || a.index - b.index,
  );
  const bars: ClashTimelineBar[] = sorted.map((interval) => {
    let lane = laneEnds.findIndex((end) => end <= interval.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(interval.end);
    } else {
      laneEnds[lane] = interval.end;
    }
    return {
      index: interval.index,
      lane,
      leftPct: ((interval.start - axisStart) / span) * 100,
      widthPct: ((interval.end - interval.start) / span) * 100,
    };
  });

  const overlapBands = overlapRegions(intervals).map((region) => ({
    leftPct: ((region.start - axisStart) / span) * 100,
    widthPct: ((region.end - region.start) / span) * 100,
  }));

  return {
    allDayIndices,
    bars,
    laneCount: laneEnds.length,
    axisStartMinute: axisStart,
    axisEndMinute: axisEnd,
    ticks: buildTicks(axisStart, axisEnd),
    overlapBands,
  };
}
