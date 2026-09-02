"use client";

import { Box, UnstyledButton } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconPin } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { PinnedEvent } from "@/lib/events/pinned";
import type { Rect } from "@/lib/motion/origin";

/** How long each title stays on screen before the next one slides in. */
const ROTATE_INTERVAL_MS = 5000;

/** Must cover the c2-ticker-* animation duration in globals.css. */
const EXIT_ANIM_MS = 360;

/**
 * The header's pinned-events pill, anchored at the header's left edge (where
 * the logo used to sit). Shows the pin icon, an inline amber count chip
 * (`1/N` — the old floating Indicator badge, inline now) and rotates through
 * the upcoming pinned events' `tickerTitle`s with a vertical ticker slide.
 * Tapping it opens the Pinned Events panel, same as the old button.
 */
export function PinnedEventsTicker({
  events,
  paused,
  onOpen,
}: {
  /** Upcoming pinned events; `null` while the first read is in flight. */
  events: PinnedEvent[] | null;
  /** True while the Pinned Events panel modal is open — rotation stops. */
  paused: boolean;
  onOpen: (originRect: Rect) => void;
}) {
  const [index, setIndex] = useState(0);
  // The previous title, kept around only for the duration of the slide-out.
  const [exiting, setExiting] = useState<PinnedEvent | null>(null);
  // Rotation pauses while hovered/focused so the title can be read, and while
  // the tab is hidden (checked in the tick).
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  const list = useMemo(() => events ?? [], [events]);
  const count = list.length;
  const safeIndex = count > 0 ? index % count : 0;
  const current = count > 0 ? list[safeIndex] : null;

  const advance = useCallback(() => {
    if (count < 2) return;
    // The exit clone only renders when the slide animation actually runs
    // (reduceMotion === false); without the animation it would sit opaque on
    // top of the incoming title until its cleanup timer drops it.
    if (reduceMotion === false) {
      setExiting(list[safeIndex]);
    }
    setIndex((i) => i + 1);
  }, [count, list, safeIndex, reduceMotion]);

  useEffect(() => {
    if (count < 2) return;
    const id = window.setInterval(() => {
      if (paused || hovered || focused) return;
      if (document.visibilityState !== "visible") return;
      advance();
    }, ROTATE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [count, paused, hovered, focused, advance]);

  useEffect(() => {
    if (exiting === null) return;
    const id = window.setTimeout(() => setExiting(null), EXIT_ANIM_MS);
    return () => window.clearTimeout(id);
  }, [exiting]);

  return (
    <UnstyledButton
      className="c2-pinned-ticker"
      onClick={(e) => onOpen(e.currentTarget.getBoundingClientRect())}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      aria-label={count > 0 ? `Pinned events (${count})` : "Pinned events"}
    >
      <Box style={{ flexShrink: 0, display: "flex" }}>
        <IconPin size={14} />
      </Box>
      {current === null ? (
        <span className="c2-pinned-ticker-title" aria-hidden>
          <span className="c2-pinned-ticker-line">Pinned events</span>
        </span>
      ) : (
        <>
          {/* The count rides the aria-label above; hide the visual chip so
              screen readers don't read it twice (the old Indicator did the
              same). */}
          <span className="c2-pinned-ticker-count" aria-hidden>
            {safeIndex + 1}/{count}
          </span>
          <span className="c2-pinned-ticker-title" aria-hidden>
            {exiting !== null && reduceMotion === false ? (
              <span key={`exit-${exiting.id}`} className="c2-pinned-ticker-line c2-ticker-exit">
                {exiting.tickerTitle}
              </span>
            ) : null}
            <span key={current.id} className="c2-pinned-ticker-line c2-ticker-enter">
              {current.tickerTitle}
            </span>
          </span>
        </>
      )}
    </UnstyledButton>
  );
}
