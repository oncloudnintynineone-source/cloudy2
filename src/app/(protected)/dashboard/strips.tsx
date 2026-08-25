"use client";

import { type RefObject } from "react";
import { Box, Text } from "@mantine/core";

import dayjs from "dayjs";

/**
 * Day-label strip for the Week view. `ResourcesWeekView`'s own day labels are
 * centered in each full-width day column, so on a phone they are only visible
 * when the viewport happens to sit over the middle of a day. This strip
 * replaces that row and pins the leftmost visible day (the caller tracks it
 * via `onScrollPositionChange`) to the grid's left edge, styled like Mantine's
 * own day labels (today filled/primary, weekends red). The strip itself is
 * sticky under the shared tabs+date-nav chrome at every breakpoint, mirroring
 * the Week v2 day header.
 */
export function WeekDayLabelStrip({
  day,
  hasGroups,
  resourceLabelWidth,
  groupLabelWidth,
  chromeOffset,
}: {
  day: string;
  hasGroups: boolean;
  resourceLabelWidth: string;
  groupLabelWidth: string;
  /** Height of the sticky tabs+date-nav chrome this strip docks below. */
  chromeOffset: number;
}) {
  const dayObj = dayjs(day);
  const isToday = dayObj.isSame(dayjs(), "day");
  const isWeekend = dayObj.day() === 0 || dayObj.day() === 6;
  // The width of the sticky corner/label columns the grid scrolls beneath,
  // matching the ResourcesWeekView sizing overrides on the view itself.
  const leftWidth = hasGroups
    ? `calc(${groupLabelWidth} + ${resourceLabelWidth})`
    : resourceLabelWidth;
  return (
    <Box
      component="div"
      style={{
        position: "sticky",
        top: `calc(var(--app-shell-header-offset) + ${chromeOffset}px)`,
        zIndex: 45,
        height: "calc(2rem * var(--mantine-scale))",
        background: "var(--mantine-color-body)",
        borderBottom: "1px solid var(--mantine-color-default-border)",
      }}
    >
      {/* Continues the corner's vertical divider across the strip's band. */}
      <Box
        component="div"
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: leftWidth,
          borderRight: "1px solid var(--mantine-color-default-border)",
        }}
      />
      <span
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: leftWidth,
          display: "flex",
          alignItems: "center",
          paddingInline: "0.5rem",
          whiteSpace: "nowrap",
          fontSize: "var(--mantine-font-size-sm)",
          fontWeight: isToday
            ? "var(--mantine-font-weight-bold)"
            : "var(--mantine-font-weight-medium)",
          textTransform: "capitalize",
          userSelect: "none",
          background: isToday ? "var(--mantine-primary-color-filled)" : "transparent",
          color: isToday
            ? "var(--mantine-primary-color-contrast)"
            : isWeekend
              ? "var(--mantine-color-red-6)"
              : undefined,
        }}
      >
        {dayObj.format("ddd D")}
      </span>
    </Box>
  );
}

/** Hourly slots per day in the schedule views (00:00–23:59 @ 60min). */
export const SLOTS_PER_DAY = 24;

/**
 * Pinned hour ruler for the Day and Week schedule views. The library's own
 * time-labels row is sticky only inside its ScrollArea viewport, which never
 * scrolls vertically (the page does), so during page scroll the axis scrolls
 * away with the grid. This strip replaces that row: it pins beneath the shared
 * chrome (like the Week day-label strip) and its inner hour track translates
 * by -scrollLeft via a direct DOM transform — no re-renders — so labels stay
 * over their columns while the grid pans horizontally, mirroring the Week v2
 * day-header mechanics.
 */
export function TimeRulerStrip({
  hasGroups,
  resourceLabelWidth,
  groupLabelWidth,
  chromeOffset,
  /** Extra sticky offset when another strip stacks above this one. */
  stackBelowHeight,
  innerRef,
}: {
  hasGroups: boolean;
  resourceLabelWidth: string;
  groupLabelWidth: string;
  chromeOffset: number;
  stackBelowHeight?: string;
  innerRef: RefObject<HTMLDivElement | null>;
}) {
  // The width of the sticky corner/label columns the grid scrolls beneath,
  // matching the ResourcesWeekView/ResourcesDayView sizing overrides.
  const leftWidth = hasGroups
    ? `calc(${groupLabelWidth} + ${resourceLabelWidth})`
    : resourceLabelWidth;
  return (
    <Box
      component="div"
      aria-hidden
      style={{
        position: "sticky",
        top: stackBelowHeight
          ? `calc(var(--app-shell-header-offset) + ${chromeOffset}px + ${stackBelowHeight})`
          : `calc(var(--app-shell-header-offset) + ${chromeOffset}px)`,
        zIndex: 45,
        display: "flex",
        overflow: "hidden",
        background: "var(--mantine-color-body)",
        borderBottom: "1px solid var(--mantine-color-default-border)",
      }}
    >
      <Box
        component="div"
        aria-hidden
        style={{
          flexShrink: 0,
          width: leftWidth,
          // Continues the corner's vertical divider across the ruler band.
          borderRight: "1px solid var(--mantine-color-default-border)",
        }}
      />
      <Box component="div" aria-hidden style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
        <Box
          ref={innerRef}
          component="div"
          style={{
            display: "flex",
            width: `calc(var(--ruler-slot, 60px) * ${SLOTS_PER_DAY})`,
            willChange: "transform",
          }}
        >
          {Array.from({ length: SLOTS_PER_DAY }, (_, hour) => (
            <Box
              key={hour}
              component="div"
              style={{
                width: "var(--ruler-slot, 60px)",
                flexShrink: 0,
                borderLeft: "1px solid var(--mantine-color-default-border)",
                padding: "2px 0 2px 4px",
              }}
            >
              <Text
                size="xs"
                c="dimmed"
                style={{ lineHeight: 1.2, userSelect: "none", whiteSpace: "nowrap" }}
              >
                {String(hour).padStart(2, "0")}
              </Text>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
