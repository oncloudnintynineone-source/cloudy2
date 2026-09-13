"use client";

import type { RefObject } from "react";
import { Box } from "@mantine/core";

import { WEEKDAY_ABBREVIATIONS } from "@/lib/events/datetime";
import type { MonthZoom } from "@/lib/ui/monthZoom";

/** Seven day columns per week row (see the Month view's zoom mechanics). */
const MONTH_COLUMNS = 7;

/**
 * Pinned weekday-initials strip for the Month view. Mantine's own weekday row
 * lives inside the Month view's content-height ScrollArea and scrolls away with
 * the page, so this strip replaces it (`withWeekDays={false}` on the MonthView).
 * It pins beneath the shared chrome like the Week (H) day-label strip. Its
 * inner 7-column track is sized to the zoomed grid width (7 day columns at the
 * same width the grid renders) and translates by -scrollLeft (driven by the
 * MonthView ScrollArea's `onScrollPositionChange`), so the initials stay over
 * their columns whenever the grid overflows the viewport — at zoom 1 the track
 * simply fills the strip, and zooming in widens both together.
 *
 * Shared by the standalone Month view and the Dual Pane view's Month pane
 * (where the strip is constrained to that pane's column, so its 100%-based
 * track tracks that pane's grid).
 */
export function MonthWeekdayStrip({
  chromeOffset,
  zoom,
  innerRef,
}: {
  chromeOffset: number;
  /** Month-grid zoom multiplier (1 = fit to viewport width). */
  zoom: MonthZoom;
  innerRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <Box
      component="div"
      style={{
        position: "sticky",
        top: `calc(var(--app-shell-header-offset) + ${chromeOffset}px)`,
        zIndex: 45,
        height: "calc(2.25rem * var(--mantine-scale))",
        background: "var(--mantine-color-body)",
        borderBottom: "1px solid var(--mantine-color-default-border)",
        overflow: "hidden",
      }}
    >
      <Box
        ref={innerRef}
        component="div"
        style={{
          display: "flex",
          // Mirrors the Month grid's zoomed content width (see
          // monthViewInnerStyle in DashboardView), so each column below lands
          // exactly over the grid's day column.
          width: `${zoom * 100}%`,
          willChange: "transform",
        }}
      >
        {WEEKDAY_ABBREVIATIONS.map((day, index) => (
          <Box
            key={day}
            component="div"
            style={{
              flex: `0 0 calc(100% / ${MONTH_COLUMNS})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "var(--mantine-font-size-sm)",
              fontWeight: "var(--mantine-font-weight-medium)",
              textTransform: "capitalize",
              color: "var(--mantine-color-dimmed)",
              borderLeft: index === 0 ? undefined : "1px solid var(--mantine-color-default-border)",
              userSelect: "none",
            }}
          >
            {day}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
