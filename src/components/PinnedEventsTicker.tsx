"use client";

import { UnstyledButton } from "@mantine/core";
import { useCallback, useEffect, useMemo, useState } from "react";

import { daysUntilDate, formatInstantToNaive } from "@/lib/events/datetime";
import type { PinnedEvent } from "@/lib/events/pinned";
import type { Rect } from "@/lib/motion/origin";

/** How long each title stays on screen before the next one slides in. */
const ROTATE_INTERVAL_MS = 5000;

/** How often the day countdown re-reads the clock, so a single (non-rotating)
 *  pinned event still rolls over at midnight. */
const CLOCK_INTERVAL_MS = 60_000;

/**
 * The title shown in the pill. `tickerTitle` (the `pinnedHeader` template) is
 * preferred, but a freshly-deployed shell can briefly receive a cached pinned
 * list shaped without the `tickerTitle` key (the list is cached server-side
 * for 60s); falling back to `title` — the panel's `pinned` template, rendered
 * through the exact same input — keeps the pill from rendering blank in that
 * window and whenever the header template yields nothing.
 */
function tickerTitleOf(event: PinnedEvent): string {
  return event.tickerTitle || event.title;
}

/**
 * The header's pinned-events pill, anchored at the header's left edge (where
 * the logo used to sit). Shows an inline amber count chip (`1/N` — the old
 * floating Indicator badge, inline now), a secondary days-remaining countdown
 * chip (`5d` — the pin icon's replacement slot, dropping at `0d` for a
 * same-day or already-started event) and rotates through the upcoming pinned
 * events' `tickerTitle`s with a vertical slide-in. Tapping it opens the Pinned
 * Events panel, same as the old button.
 *
 * The static "Pinned events" label is the pill's degraded look for both the
 * in-flight and the loaded-but-empty cases; visually they are identical on
 * purpose. `status` distinguishes them for the accessible name only (pending /
 * error / empty), so a screen reader never hears a loaded-but-empty pill as
 * "still loading" — or an errored one as loading forever.
 */
export function PinnedEventsTicker({
  events,
  paused,
  onOpen,
  status = "pending",
}: {
  /** Upcoming pinned events; `null` while the first read is in flight. */
  events: PinnedEvent[] | null;
  /** True while the Pinned Events panel modal is open — rotation stops. */
  paused: boolean;
  onOpen: (originRect: Rect) => void;
  /** Whether the first read has settled; selects the accessible name when no
   *  events are shown. */
  status?: "pending" | "ready" | "error";
}) {
  const [index, setIndex] = useState(0);
  // Rotation pauses while hovered/focused so the title can be read, and while
  // the tab is hidden (checked in the tick).
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  // Current SGT wall clock, refreshed on a slow interval so the day countdown
  // rolls over even when a single pinned event never re-renders.
  const [nowNaive, setNowNaive] = useState(() => formatInstantToNaive(new Date()));

  const list = useMemo(() => events ?? [], [events]);
  const count = list.length;
  const safeIndex = count > 0 ? index % count : 0;
  const current = count > 0 ? list[safeIndex] : null;
  const daysUntil = current ? daysUntilDate(nowNaive, current.start) : 0;

  const accessibleLabel =
    count > 0
      ? `Pinned events (${count})`
      : status === "error"
        ? "Pinned events unavailable"
        : status === "pending"
          ? "Loading pinned events"
          : "Pinned events";

  const advance = useCallback(() => {
    if (count < 2) return;
    setIndex((i) => i + 1);
  }, [count]);

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
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setNowNaive(formatInstantToNaive(new Date()));
    }, CLOCK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <UnstyledButton
      className="c2-pinned-ticker"
      onClick={(e) => onOpen(e.currentTarget.getBoundingClientRect())}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      aria-label={accessibleLabel}
    >
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
          {/* Days until the current event's start (date-part difference, so a
              same-day or already-started event reads `0d`); hidden from the
              accessible name like the count chip. */}
          <span className="c2-pinned-ticker-countdown" aria-hidden>
            {daysUntil}d
          </span>
          <span className="c2-pinned-ticker-title" aria-hidden>
            {/* Keyed by event id so a rotation remounts the line and replays
                the slide-in; the line is a normal in-flow element (no
                absolute overlay), so the title can never be clipped away. */}
            <span key={current.id} className="c2-pinned-ticker-line c2-ticker-enter">
              {tickerTitleOf(current)}
            </span>
          </span>
        </>
      )}
    </UnstyledButton>
  );
}
