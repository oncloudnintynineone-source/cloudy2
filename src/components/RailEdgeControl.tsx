"use client";

import { Box } from "@mantine/core";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";

import { NAV_IDLE_COLOR } from "@/components/navChrome";

/**
 * The shared horizontal-scroller edge affordance: a gradient fade over the
 * clipped content signalling "more this way" plus a purely decorative
 * chevron. The whole control is `pointer-events: none`, so taps pass through
 * to the clipped content behind the fade; panning happens by touch swipe (or
 * wheel), and each side's control hides once the scroller reaches that
 * extreme (nothing is clipped on that side any more).
 *
 * Born as the bottom-nav rail's affordance (`AppShellShell`) and shared with
 * the Settings tab strip (`SettingsTabs`, docs/ui-ux-improvements.md C1).
 * Position it inside a `position: relative` (or fixed) wrapper that matches
 * the scroller's box; pair it with `useScrollEdges` on the scroller element.
 */
export function RailEdgeControl({
  side,
  hidden,
  hint,
}: {
  side: "left" | "right";
  hidden?: boolean;
  hint?: boolean;
}) {
  return (
    <Box
      // Kept mounted so the affordance can dissolve (`.c2-rail-edge`) when the
      // scroller reaches its extreme instead of snapping out of the layout; the
      // whole control is `pointer-events: none`, so a faded edge never blocks
      // taps on the clipped content behind it.
      className={`c2-rail-edge${hidden ? " c2-rail-edge--hidden" : ""}`}
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        width: 44,
        left: side === "left" ? 0 : "auto",
        right: side === "left" ? "auto" : 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        background:
          side === "right"
            ? "linear-gradient(to left, var(--mantine-color-default), transparent)"
            : "linear-gradient(to right, var(--mantine-color-default), transparent)",
        zIndex: 1,
      }}
      aria-hidden
    >
      <Box
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 8,
          color: NAV_IDLE_COLOR,
        }}
      >
        <Box className={hint ? "c2-rail-hint" : undefined}>
          {side === "right" ? <IconChevronRight size={20} /> : <IconChevronLeft size={20} />}
        </Box>
      </Box>
    </Box>
  );
}
