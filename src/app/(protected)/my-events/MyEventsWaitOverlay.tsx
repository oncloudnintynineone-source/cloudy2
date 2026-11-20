"use client";

import { useEffect, useState } from "react";
import { Image, Stack, Text } from "@mantine/core";

import {
  MY_EVENTS_WAIT_LINES,
  MY_EVENTS_WAIT_TIPS,
  pickRotating,
} from "@/lib/events/myEventsWaitCopy";

/**
 * Delay before the card fades in — mirrors the ActivityBar show-delay. A warm
 * My Events build (~20 ms) plus a fast network lands well under this, so the
 * overlay never flashes on quick entries; it only dresses waits long enough to
 * feel like something is wrong.
 */
const WAIT_OVERLAY_REVEAL_MS = 300;

/** Headline cadence — slow enough to read each line, fast enough to feel alive. */
const LINE_ROTATE_MS = 2800;

/** Tip cadence — one headline change per tip change, so the tip reads as the
 *  quiet footnote and never competes with the headline for attention. */
const TIP_ROTATE_MS = LINE_ROTATE_MS * 3;

/**
 * The My Events wait overlay: a frosted card riding dead-centre on the shared
 * list skeleton (`MyEventsListSkeleton`) while the always-fresh route build
 * runs (docs/loading-transitions.md §1.4). The app icon breathes on the same
 * ambient cadence as the cold-start brand overlay over a rotating line of
 * honest "calendar archaeology" copy, with a slower dimmed tip ticker below.
 *
 * Purely decorative: `aria-hidden` and pointer-transparent — the sr-only
 * `LoadingStatus` (route fallback) or `CrossfadeSwap` label (in-page swap)
 * stays the only announcement. It reveals only after `WAIT_OVERLAY_REVEAL_MS`
 * so warm loads never flash it, pauses rotation on hidden tabs, and under
 * reduced motion shows a static line + tip with no intervals or animations
 * (the CSS animations gate on `prefers-reduced-motion` too).
 *
 * SSR renders the hidden state, so the client reveal can never mismatch.
 */
export function MyEventsWaitOverlay() {
  const [revealed, setRevealed] = useState(false);
  const [lineTick, setLineTick] = useState(0);
  const [tipTick, setTipTick] = useState(0);

  useEffect(() => {
    const id = window.setTimeout(() => setRevealed(true), WAIT_OVERLAY_REVEAL_MS);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    // Same direct probe as CrossfadeSwap/flipReorder — a media change during a
    // single skeleton mount is not worth a subscription (the CSS animations
    // gate on the media query live regardless).
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const line = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        setLineTick((tick) => tick + 1);
      }
    }, LINE_ROTATE_MS);
    const tip = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        setTipTick((tick) => tick + 1);
      }
    }, TIP_ROTATE_MS);
    return () => {
      window.clearInterval(line);
      window.clearInterval(tip);
    };
  }, []);

  if (!revealed) {
    return null;
  }

  const line = pickRotating(MY_EVENTS_WAIT_LINES, lineTick);
  const tip = pickRotating(MY_EVENTS_WAIT_TIPS, tipTick);

  return (
    <div className="c2-wait" aria-hidden="true">
      <Stack className="c2-wait-card c2-glass-surface" gap="xs" align="center">
        <Image src="/icon.svg" alt="" className="c2-wait-icon" draggable={false} />
        {/* Keyed by the tick so each rotation remounts the line and replays the
            shared swap (same trick as the pinned ticker). */}
        {line ? (
          <Text key={lineTick} className="c2-wait-line c2-wait-swap" size="sm" fw={600}>
            {line}
          </Text>
        ) : null}
        {tip ? (
          <Text key={`tip-${tipTick}`} className="c2-wait-tip c2-wait-swap" size="xs" c="dimmed">
            {tip}
          </Text>
        ) : null}
      </Stack>
    </div>
  );
}
