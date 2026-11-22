"use client";

import { useRef, type CSSProperties, type ReactNode, type Ref } from "react";
import { Box } from "@mantine/core";

import { PILL_CIRCLE, PILL_MIN_VISIBLE_ACTIONS, pillActionsMin } from "@/lib/ui/controlPill";
import { useScrollEdges } from "@/lib/ui/scrollEdges";

interface ControlPillProps {
  /**
   * The read-out that owns the first row: a static label (`.c2-pill-label`,
   * optionally `.c2-pill-label--fill` to centre in the leftover space) or a
   * search field (`.c2-pill-field`). It keeps its own width — the controls
   * never squeeze it.
   */
  leading: ReactNode;
  /** The circular controls, laid out in their own panning strip. */
  actions: ReactNode;
  /** Accessible name of the control group (e.g. `"Calendar controls"`). */
  actionsLabel: string;
  /** Circle diameter of the controls — drives the wrap floor. */
  circleSize?: number;
  /** Circles the strip must show before it wraps (defaults to 3). */
  minActions?: number;
  /** Extra classes on the pill surface (the calendar's chrome-hide state). */
  className?: string;
  /** Ref for measuring the pill's height (page pads / rows floating above). */
  pillRef?: Ref<HTMLDivElement>;
  /** Extra inline styles on the pill surface. */
  style?: CSSProperties;
}

/**
 * The shared mobile **control pill** surface and layout — the frosted bottom row
 * the calendar, Parade State, Contacts and the settings list pages float
 * (`.c2-control-pill` / `.c2-pill-row` in `globals.css`).
 *
 * One row, two slots: the `leading` read-out (period/day label or search field)
 * and the `actions` circles in their own horizontally panning strip. The strip's
 * flex-basis is `pillActionsMin(circleSize, minActions)`, and because flex line
 * breaking uses the *hypothetical* basis, the strip shares the line with the
 * label whenever `label + min` fits and otherwise drops to a full-width second
 * row instead of collapsing to a sliver — so a six-circle pill on a 320px phone
 * pans first and wraps second, and nothing ever truncates the label to three
 * characters or jams a circle into the pill's rounded cap. Frosted edge fades
 * (`useScrollEdges`) show which side still has content.
 *
 * The surface and the strip stay `pointer-events: none` (only buttons/inputs opt
 * back in — the `.c2-control-pill` rule), so a swipe starting on a circle pans
 * the strip while a swipe on the gap still reaches the content beneath: the
 * pill's tap-through contract, and what lets the calendar's chrome-hide hit test
 * tell "tapping the pill" from "pressing the pane".
 *
 * The `Affix` wrapper deliberately lives with each page: the bottom offset
 * differs (the calendar's measured FAB stack, the keyboard lift on Contacts /
 * Parade State / settings, the settings footer clearance), and the pill's height
 * is published back out through `pillRef` so a wrapped (two-row) pill re-flows
 * the page pads and any row floating above it by itself.
 */
export function ControlPill({
  leading,
  actions,
  actionsLabel,
  circleSize = PILL_CIRCLE.calendar,
  minActions = PILL_MIN_VISIBLE_ACTIONS,
  className,
  pillRef,
  style,
}: ControlPillProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const edges = useScrollEdges(scrollRef);

  return (
    <Box
      ref={pillRef}
      className={`c2-glass-surface c2-control-pill${className ? ` ${className}` : ""}`}
      style={style}
    >
      <Box
        className="c2-pill-row"
        __vars={{ "--c2-pill-actions-min": pillActionsMin(circleSize, minActions) }}
      >
        {leading}
        <Box className="c2-pill-actions">
          <Box ref={scrollRef} className="c2-pill-scroll" role="group" aria-label={actionsLabel}>
            <Box className="c2-pill-scroll-inner">{actions}</Box>
          </Box>
          {/* Edge fades: the shared rail affordance (`RailEdgeControl`'s
              gradient, minus the chevron — the half-visible circle is the
              affordance at this height). They ride the non-scrolling wrapper,
              because an absolutely positioned child of the scroller would
              scroll away with the content. */}
          <Box
            className="c2-pill-edge c2-pill-edge--start"
            aria-hidden
            style={{ opacity: edges.atStart ? 0 : 1 }}
          />
          <Box
            className="c2-pill-edge c2-pill-edge--end"
            aria-hidden
            style={{ opacity: edges.atEnd ? 0 : 1 }}
          />
        </Box>
      </Box>
    </Box>
  );
}
