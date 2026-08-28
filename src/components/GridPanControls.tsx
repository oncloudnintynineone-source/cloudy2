"use client";

import { type CSSProperties, type RefObject, useEffect, useState } from "react";
import { ActionIcon } from "@mantine/core";
import { IconTriangleFilled } from "@tabler/icons-react";

/**
 * Floating pan buttons for the dashboard's wide grids (Day/Week (H) schedule
 * views, Week (D)): fixed at the viewport's mid-height, one per edge that can
 * still scroll, positioned just inside the grid's own left/right edges (the
 * anchor box) rather than the window's — the desktop sidebar sits left of the
 * grid, so a window-left button would overlap it. The anchor rect is
 * re-measured on resize (sidebar collapse, immersive mode and window resizes
 * all change it). Always visible whenever the grid overflows, at any
 * breakpoint — drag-to-pan and the buttons are the discoverable horizontal
 * affordance on both desktop and mobile. Subdued circular grey with filled
 * triangles: intentionally lighter than the date-nav chevrons and the prior
 * brand-filled arrows so the control reads as secondary chrome.
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
          size={40}
          radius="50%"
          variant="filled"
          color="gray"
          styles={{
            root: {
              backgroundColor: "color-mix(in srgb, var(--mantine-color-gray-filled) 50%, transparent)",
              "&:where([data-disabled])": {
                backgroundColor: "color-mix(in srgb, var(--mantine-color-gray-filled) 50%, transparent)",
              },
              "&:where(:hover)": {
                backgroundColor: "color-mix(in srgb, var(--mantine-color-gray-filled) 60%, transparent)",
              },
            },
          }}
          aria-label="Scroll grid left"
          onClick={() => onPan("start")}
        >
          <IconTriangleFilled size={14} style={{ transform: "rotate(-90deg)" }} />
        </ActionIcon>
      )}
      {canScrollRight && (
        <ActionIcon
          style={{ ...baseStyle, right: offsets.right }}
          size={40}
          radius="50%"
          variant="filled"
          color="gray"
          styles={{
            root: {
              backgroundColor: "color-mix(in srgb, var(--mantine-color-gray-filled) 50%, transparent)",
              "&:where([data-disabled])": {
                backgroundColor: "color-mix(in srgb, var(--mantine-color-gray-filled) 50%, transparent)",
              },
              "&:where(:hover)": {
                backgroundColor: "color-mix(in srgb, var(--mantine-color-gray-filled) 60%, transparent)",
              },
            },
          }}
          aria-label="Scroll grid right"
          onClick={() => onPan("end")}
        >
          <IconTriangleFilled size={14} style={{ transform: "rotate(90deg)" }} />
        </ActionIcon>
      )}
    </>
  );
}
