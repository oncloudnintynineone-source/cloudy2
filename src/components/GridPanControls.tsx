"use client";

import { type CSSProperties, type RefObject, useEffect, useState } from "react";
import { ActionIcon } from "@mantine/core";
import { IconArrowsLeft, IconArrowsRight } from "@tabler/icons-react";

/**
 * Floating pan buttons for the dashboard's wide grids (Day/Week schedule
 * views, Week v2): fixed at the viewport's mid-height, one per edge that can
 * still scroll, positioned just inside the grid's own left/right edges (the
 * anchor box) rather than the window's — the desktop sidebar sits left of the
 * grid, so a window-left button would overlap it. The anchor rect is
 * re-measured on resize (sidebar collapse, immersive mode and window resizes
 * all change it). Desktop-only: below lg there is no mouse pan to advertise.
 * Filled primary + full arrows on purpose: the grey outline chevrons of the
 * date-nav row read as "navigate days", while these must read at a glance as
 * "the grid continues off-screen".
 */
export function GridPanControls({
  anchorRef,
  canScrollLeft,
  canScrollRight,
  onPan,
}: {
  anchorRef: RefObject<HTMLDivElement | null>;
  canScrollLeft: boolean;
  canScrollRight: boolean;
  onPan: (edge: "start" | "end") => void;
}) {
  // Measured 8px-inset offsets from the window edges (null before first
  // paint; the effect measures synchronously on mount so this never renders
  // with stale geometry).
  const [offsets, setOffsets] = useState<{ left: number; right: number } | null>(null);

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) {
      return;
    }
    const measure = () => {
      const rect = anchor.getBoundingClientRect();
      // 8px inside each grid edge; clamp to half the viewport so a very narrow
      // grid can't push the buttons off-screen or onto each other.
      setOffsets({
        left: Math.min(rect.left + 8, window.innerWidth / 2),
        right: Math.min(window.innerWidth - rect.right + 8, window.innerWidth / 2),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(anchor);
    return () => observer.disconnect();
  }, [anchorRef]);

  if (!offsets || (!canScrollLeft && !canScrollRight)) {
    return null;
  }

  const baseStyle: CSSProperties = {
    position: "fixed",
    top: "50%",
    transform: "translateY(-50%)",
    // Below the sticky date-nav chrome (50) and the modals; above the grids'
    // internal stickies (<= 20).
    zIndex: 30,
  };

  return (
    <>
      {canScrollLeft && (
        <ActionIcon
          style={{ ...baseStyle, left: offsets.left }}
          visibleFrom="lg"
          size={44}
          variant="filled"
          color="primary"
          styles={{ root: { boxShadow: "var(--mantine-shadow-md)" } }}
          aria-label="Scroll grid left"
          onClick={() => onPan("start")}
        >
          <IconArrowsLeft size={22} />
        </ActionIcon>
      )}
      {canScrollRight && (
        <ActionIcon
          style={{ ...baseStyle, right: offsets.right }}
          visibleFrom="lg"
          size={44}
          variant="filled"
          color="primary"
          styles={{ root: { boxShadow: "var(--mantine-shadow-md)" } }}
          aria-label="Scroll grid right"
          onClick={() => onPan("end")}
        >
          <IconArrowsRight size={22} />
        </ActionIcon>
      )}
    </>
  );
}
