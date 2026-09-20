"use client";

import type { RefObject } from "react";
import { Box } from "@mantine/core";

import { WEEKDAY_ABBREVIATIONS } from "@/lib/events/datetime";

/** Seven day columns per week row (see the Month view's zoom mechanics). */
const MONTH_COLUMNS = 7;

/**
 * Pinned weekday-initials strip for the Month view. Mantine's own weekday row
 * lives inside the Month view's content-height ScrollArea and scrolls away with
 * the page, so this strip replaces it (`withWeekDays={false}` on the MonthView).
 * It pins beneath the shared chrome like the Week (H) day-label strip. Its
 * inner 7-column track mirrors the Month grid's zoomed content width (both ride
 * the shared `--c2-zoom` / `--c2-zoom-anim`, so they widen together) and
 * translates by -scrollLeft (driven by the MonthView ScrollArea's
 * `onScrollPositionChange`), so the initials stay over their columns whenever
 * the grid overflows the viewport — at zoom 1 the track simply fills the strip.
 *
 * Shared by the standalone Month view and the Dual Pane view's Month pane
 * (where the strip is constrained to that pane's column, so its 100%-based
 * track tracks that pane's grid).
 */
export function MonthWeekdayStrip({
  chromeOffset,
  innerRef,
  sticky = true,
}: {
  chromeOffset: number;
  innerRef: RefObject<HTMLDivElement | null>;
  /**
   * Pin beneath the shared chrome (standalone Month view / stacked Dual Pane).
   * `false` when the strip is already the fixed header of the Dual Pane's own
   * bounded scroll pane at `lg`, where the pane is the scroll container and a
   * chrome-relative `top` would push the strip down inside it.
   */
  sticky?: boolean;
}) {
  return (
    <Box
      component="div"
      style={{
        position: sticky ? "sticky" : "relative",
        top: sticky ? `calc(var(--app-shell-header-offset) + ${chromeOffset}px)` : undefined,
        zIndex: 45,
        // Hug the labels: a fixed 2.25rem height (matching Mantine's own
        // weekday row) left the inner track — which has no height of its own —
        // at the top of a 36px box, wasting ~14px before the grid. Auto height
        // plus a hair of padding removes that band; the cells already center
        // their text.
        height: "auto",
        paddingBlock: "calc(0.125rem * var(--mantine-scale))",
        background: "var(--mantine-color-body)",
        borderBottom: "1px solid var(--mantine-color-default-border)",
        overflow: "hidden",
      }}
    >
      <Box
        ref={innerRef}
        component="div"
        className="c2-zoom-track"
        style={{
          display: "flex",
          // Mirrors the Month grid's zoomed content width (ZOOM_VAR in
          // DashboardView), so each column below lands exactly over the grid's
          // day column and animates with it.
          width: "calc(var(--c2-zoom-anim, var(--c2-zoom)) * 100%)",
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
