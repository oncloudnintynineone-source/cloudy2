"use client";

import { UnstyledButton } from "@mantine/core";
import { useCallback, useEffect, useMemo, useState } from "react";

import { daysUntilDate, formatInstantToNaive } from "@/lib/events/datetime";
import type { PinnedEvent } from "@/lib/events/pinned";
import type { Rect } from "@/lib/motion/origin";
import {
  pinnedTickerIndicatorFlag,
  resolveFlagValue,
  type PinnedTickerIndicator,
} from "@/lib/settings/featureFlags";

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
 * the logo used to sit). Renders the `pinnedTickerIndicator` feature-flag
 * variant (Settings → Feature Flags) — see the flow in §1 of
 * `docs/pinned-events.md`:
 *
 * - `classic` — the original inline amber `1/N` count chip, the `5d` countdown
 *   chip and the rotating title.
 * - `split` — the count and countdown joined into one two-tone pill (amber
 *   `X/N` half + blue `5d` half), content-sized.
 * - `segmented` — a thin segmented progress bar pinned to the pill's bottom
 *   edge (one segment per pinned event, the current rotation position lit
 *   amber), with the `5d` chip; the count chip is gone so the title gets its
 *   full width.
 * - `badge` — a compact amber count badge over the pill's corner carrying just
 *   the count, `5d` chip and full-width title.
 * - `stacked` — the position and countdown folded into one narrow two-line
 *   leading block (`1/5` over `5d`).
 *
 * Every variant keeps the count accessible via the button's `aria-label`
 * ("Pinned events (N)"); the count, countdown and progress chrome are
 * `aria-hidden`. Tapping the pill opens the Pinned Events panel.
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
  indicator,
  status = "pending",
}: {
  /** Upcoming pinned events; `null` while the first read is in flight. */
  events: PinnedEvent[] | null;
  /** True while the Pinned Events panel modal is open — rotation stops. */
  paused: boolean;
  onOpen: (originRect: Rect) => void;
  /** Indicator style from the Feature Flags settings; defensively normalized
   *  so a stale cached flag can never reach the renderer. */
  indicator?: PinnedTickerIndicator;
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
  // Defensive: a cached server list or a stale layout prop can briefly carry an
  // unknown indicator — resolve against the registry's defaults.
  const safeIndicator = resolveFlagValue(pinnedTickerIndicatorFlag, indicator);

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
      data-indicator={safeIndicator}
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
          {safeIndicator === "classic" ? (
            <span className="c2-pinned-ticker-count" aria-hidden>
              {safeIndex + 1}/{count}
            </span>
          ) : null}
          {safeIndicator === "stacked" ? (
            <span className="c2-pinned-ticker-stacked" aria-hidden>
              <span className="c2-pinned-ticker-stacked-count">
                {safeIndex + 1}/{count}
              </span>
              <span className="c2-pinned-ticker-stacked-countdown">{daysUntil}d</span>
            </span>
          ) : safeIndicator === "split" ? (
            <span className="c2-pinned-ticker-split" aria-hidden>
              <span className="c2-pinned-ticker-split-count">
                {safeIndex + 1}/{count}
              </span>
              <span className="c2-pinned-ticker-split-countdown">{daysUntil}d</span>
            </span>
          ) : (
            <span className="c2-pinned-ticker-countdown" aria-hidden>
              {daysUntil}d
            </span>
          )}
          <span className="c2-pinned-ticker-title" aria-hidden>
            {/* Keyed by event id so a rotation remounts the line and replays
                the slide-in; the line is a normal in-flow element (no
                absolute overlay), so the title can never be clipped away. */}
            <span key={current.id} className="c2-pinned-ticker-line c2-ticker-enter">
              {tickerTitleOf(current)}
            </span>
          </span>
          {/* Segmented rotation bar: one segment per pinned event, the current
              rotation position lit amber, spanning the pill's bottom edge. */}
          {safeIndicator === "segmented" ? (
            <span className="c2-pinned-ticker-progress" aria-hidden>
              {Array.from({ length: count }, (_, i) => (
                <span
                  key={i}
                  className={
                    i === safeIndex
                      ? "c2-pinned-ticker-progress-seg is-active"
                      : "c2-pinned-ticker-progress-seg"
                  }
                />
              ))}
            </span>
          ) : null}
          {/* Compact amber count badge over the pill's corner; position rides
              the rotation titles themselves. */}
          {safeIndicator === "badge" ? (
            <span className="c2-pinned-ticker-badge" aria-hidden>
              {count}
            </span>
          ) : null}
        </>
      )}
    </UnstyledButton>
  );
}
