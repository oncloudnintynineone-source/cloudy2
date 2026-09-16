"use client";

import Link from "next/link";
import dayjs from "dayjs";
import { Box, Stack, Text } from "@mantine/core";

import { buildClashTimeline, type ClashTimelineInput } from "@/lib/events/clashTimeline";
import { clashDayBuckets, clashDayLabel, formatAxisMinute } from "@/lib/events/clashDisplay";
import type { Rect } from "@/lib/motion/origin";

/** One event rendered on the conflict timeline. */
export interface ClashTimelineEntry extends ClashTimelineInput {
  /** Label on the bar (the template-rendered event title). */
  label: string;
  /** Full name (the stored title) for the accessible name / tooltip. */
  title: string;
  /** Mantine palette color name. */
  color: string;
  /** Optional dashboard deep link; without it (and without `onSelect`) the bar is inert. */
  href?: string;
  /** Optional in-place select handler (opens the detail modal); takes precedence. */
  onSelect?: (rect: Rect) => void;
}

const LANE_HEIGHT = 26;
const BAR_GAP = 6;

/**
 * Theme-aware bar colors: a light pastel fill with dark text in light mode,
 * inverted to a deep fill with light text in dark mode. `light-dark()` resolves
 * from the app's `color-scheme` (Mantine sets it on the root).
 */
function colorStyle(color: string): React.CSSProperties {
  return {
    backgroundColor: `light-dark(var(--mantine-color-${color}-1), var(--mantine-color-${color}-9))`,
    color: `light-dark(var(--mantine-color-${color}-9), var(--mantine-color-${color}-1))`,
    borderColor: `light-dark(var(--mantine-color-${color}-4), var(--mantine-color-${color}-6))`,
  };
}

/**
 * The visual conflict timeline for one episode day (docs/user-clashes.md §1.8):
 * a time axis with colored, lane-packed bars for each overlapping event and the
 * overlap regions shaded. Whole-day events render as a band above the axis.
 * Each bar is a deep link to the event on the dashboard.
 */
export function ClashTimeline({
  entries,
  dayKey,
}: {
  entries: ClashTimelineEntry[];
  dayKey: string;
}) {
  const timeline = buildClashTimeline(entries, dayKey);
  const span = timeline.axisEndMinute - timeline.axisStartMinute;
  const trackHeight = Math.max(timeline.laneCount, 1) * LANE_HEIGHT;

  return (
    <Stack gap={6}>
      {timeline.allDayIndices.map((index) => {
        const item = entries[index];
        const content = (
          <>
            <Text size="xs" fw={600} truncate>
              {item.label}
            </Text>
            <Text size="10px" style={{ flexShrink: 0, opacity: 0.75 }}>
              All day
            </Text>
          </>
        );
        if (item.onSelect) {
          return (
            <button
              key={`allday-${index}`}
              type="button"
              className="c2-clash-allday"
              style={colorStyle(item.color)}
              aria-label={`${item.title} — all day, view details`}
              onClick={(e) => item.onSelect?.(e.currentTarget.getBoundingClientRect())}
            >
              {content}
            </button>
          );
        }
        return item.href ? (
          <Link
            key={`allday-${index}`}
            href={item.href}
            className="c2-clash-allday"
            style={colorStyle(item.color)}
            aria-label={`${item.title} — all day, open event`}
          >
            {content}
          </Link>
        ) : (
          <div
            key={`allday-${index}`}
            className="c2-clash-allday"
            style={colorStyle(item.color)}
            title={`${item.title} — all day`}
          >
            {content}
          </div>
        );
      })}
      {timeline.bars.length > 0 ? (
        <Box>
          <div className="c2-clash-track" style={{ height: trackHeight }}>
            {timeline.overlapBands.map((band, index) => (
              <span
                key={`band-${index}`}
                className="c2-clash-overlap"
                style={{ left: `${band.leftPct}%`, width: `${band.widthPct}%` }}
                aria-hidden
              />
            ))}
            {timeline.bars.map((bar) => {
              const item = entries[bar.index];
              const barStyle: React.CSSProperties = {
                left: `${bar.leftPct}%`,
                width: `${bar.widthPct}%`,
                top: bar.lane * LANE_HEIGHT,
                height: LANE_HEIGHT - BAR_GAP,
                ...colorStyle(item.color),
              };
              const content = (
                <Text size="xs" fw={600} truncate style={{ minWidth: 0 }}>
                  {item.label}
                </Text>
              );
              if (item.onSelect) {
                return (
                  <button
                    key={`bar-${bar.index}`}
                    type="button"
                    className="c2-clash-bar"
                    style={barStyle}
                    aria-label={`${item.title} — ${item.label}, view details`}
                    onClick={(e) => item.onSelect?.(e.currentTarget.getBoundingClientRect())}
                  >
                    {content}
                  </button>
                );
              }
              return item.href ? (
                <Link
                  key={`bar-${bar.index}`}
                  href={item.href}
                  className="c2-clash-bar"
                  style={barStyle}
                  aria-label={`${item.title} — ${item.label}, open event`}
                >
                  {content}
                </Link>
              ) : (
                <div
                  key={`bar-${bar.index}`}
                  className="c2-clash-bar"
                  style={barStyle}
                  title={`${item.title} — ${item.label}`}
                >
                  {content}
                </div>
              );
            })}
          </div>
          <div className="c2-clash-axis" aria-hidden>
            {timeline.ticks.map((minute) => (
              <span
                key={minute}
                className="c2-clash-tick"
                style={{ left: `${((minute - timeline.axisStartMinute) / span) * 100}%` }}
              >
                {formatAxisMinute(minute)}
              </span>
            ))}
          </div>
        </Box>
      ) : null}
    </Stack>
  );
}

/**
 * Multi-day clash visual: one `ClashTimeline` per covered day, each on its own
 * tight axis, behind a day subheading. A multi-day event appears in every day
 * it covers (so its all-day band repeats per clash day). `minEntriesPerDay`
 * drops days covered by fewer entries — pass `2` to keep only genuine clash
 * days (a multi-day event passing through a day alone is not a clash). Capped
 * at `maxDays` with a `+N more days` note. Shared by the Double Booking page
 * and the wizard's review-step advisory. See docs/user-clashes.md §1.8.
 */
export function ClashTimelineDays({
  entries,
  todayKey,
  minEntriesPerDay = 1,
  maxDays = 5,
}: {
  entries: ClashTimelineEntry[];
  /** `YYYY-MM-DD` used to label `Today` / `Tomorrow`. */
  todayKey: string;
  /** Minimum entries covering a day for it to render (2 = clash days only). */
  minEntriesPerDay?: number;
  /** Maximum day rows before collapsing into a `+N more days` note. */
  maxDays?: number;
}) {
  const buckets = clashDayBuckets(entries, minEntriesPerDay);
  const shown = buckets.slice(0, maxDays);
  const showDayLabels = buckets.length > 1;
  return (
    <Stack gap="sm">
      {shown.map(({ dayKey, indices }) => (
        <Stack key={dayKey} gap={4}>
          {showDayLabels ? (
            <Text size="xs" fw={600} c="dimmed">
              {clashDayLabel(dayKey, todayKey)}
            </Text>
          ) : null}
          <ClashTimeline entries={indices.map((index) => entries[index])} dayKey={dayKey} />
        </Stack>
      ))}
      {buckets.length > shown.length ? (
        <Text size="xs" c="dimmed">
          +{buckets.length - shown.length} more days
        </Text>
      ) : null}
    </Stack>
  );
}

/** One day cell in the 30-day overview strip. */
export interface ClashDayStripDay {
  dayKey: string;
  count: number;
}

/**
 * The 30-day overview strip: one cell per day with its conflict count; busy
 * days are tappable and scroll to that day's section. See
 * docs/user-clashes.md §1.8.
 */
export function ClashDayStrip({
  days,
  todayKey,
  onJump,
}: {
  days: ClashDayStripDay[];
  todayKey: string;
  onJump: (dayKey: string) => void;
}) {
  return (
    <div className="c2-clash-strip" aria-label="Double bookings over the next 30 days">
      {days.map(({ dayKey, count }) => {
        const date = dayjs(dayKey);
        const busy = count > 0;
        const label = `${date.format("ddd D MMM")}${
          busy ? `, ${count} double booking${count === 1 ? "" : "s"}` : ", clear"
        }`;
        return (
          <button
            key={dayKey}
            type="button"
            className={`c2-clash-strip-cell${busy ? " c2-clash-strip-cell--busy" : ""}${
              dayKey === todayKey ? " c2-clash-strip-cell--today" : ""
            }`}
            onClick={() => onJump(dayKey)}
            disabled={!busy}
            aria-label={label}
          >
            <span className="c2-clash-strip-dow" aria-hidden>
              {date.format("dd")[0]}
            </span>
            <span className="c2-clash-strip-day" aria-hidden>
              {date.format("D")}
            </span>
            <span className="c2-clash-strip-dot" aria-hidden>
              {busy ? count : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}
