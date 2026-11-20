"use client";

import { useEffect, useState } from "react";
import { Image, Stack, Text } from "@mantine/core";

import { pickRotating } from "@/lib/loading/waitCopy";

/**
 * Delay before the card fades in — mirrors the ActivityBar show-delay. A warm
 * build lands well under this, so the overlay never flashes on quick entries;
 * it only dresses waits long enough to feel like something is wrong.
 */
const WAIT_OVERLAY_REVEAL_MS = 300;

/** Headline cadence — slow enough to read each line, fast enough to feel alive. */
const LINE_ROTATE_MS = 2800;

/** Tip cadence — one headline change per tip change, so the tip reads as the
 *  quiet footnote and never competes with the headline for attention. */
const TIP_ROTATE_MS = LINE_ROTATE_MS * 3;

/**
 * The rotating copy core (docs/loading-transitions.md §1.4.1): a headline that
 * swaps every ~2.8 s with a slower dimmed tip below, each keyed by its tick so
 * a rotation remounts the line and replays the shared `c2-wait-swap` rise
 * (same trick as the pinned ticker). Pauses on hidden tabs; under
 * `prefers-reduced-motion` it renders the first line statically with no
 * intervals (the CSS animations gate on the media query too).
 *
 * Purely decorative — callers keep it inside `aria-hidden` surfaces; the
 * sr-only `LoadingStatus` stays the only announcement. Copy comes from
 * `src/lib/loading/waitCopy.ts` (honest lines only, never fake progress).
 *
 * `subline` renders the smaller dimmer flavor used under the cold-start
 * "Waking from Deep Sleep…" brand headline (`ColdStartBrandOverlay`).
 */
export function RotatingWaitLines({
  lines,
  tips,
  subline = false,
}: {
  lines: readonly string[];
  tips?: readonly string[];
  subline?: boolean;
}) {
  const [lineTick, setLineTick] = useState(0);
  const [tipTick, setTipTick] = useState(0);

  useEffect(() => {
    // Same direct probe as CrossfadeSwap/flipReorder — a media change during a
    // single skeleton mount is not worth a subscription.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const line = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        setLineTick((tick) => tick + 1);
      }
    }, LINE_ROTATE_MS);
    const tip = tips?.length
      ? window.setInterval(() => {
          if (document.visibilityState === "visible") {
            setTipTick((tick) => tick + 1);
          }
        }, TIP_ROTATE_MS)
      : null;
    return () => {
      window.clearInterval(line);
      if (tip) {
        window.clearInterval(tip);
      }
    };
  }, [tips]);

  const line = pickRotating(lines, lineTick);
  const tip = tips ? pickRotating(tips, tipTick) : "";

  return (
    <>
      {line ? (
        <Text
          key={lineTick}
          className="c2-wait-line c2-wait-swap"
          size={subline ? "xs" : "sm"}
          fw={subline ? 400 : 600}
          c={subline ? "dimmed" : undefined}
        >
          {line}
        </Text>
      ) : null}
      {tip ? (
        <Text key={`tip-${tipTick}`} className="c2-wait-tip c2-wait-swap" size="xs" c="dimmed">
          {tip}
        </Text>
      ) : null}
    </>
  );
}

/**
 * The shared wait overlay (docs/loading-transitions.md §1.4.1): a frosted,
 * borderless card riding dead-centre on a route's list skeleton while a slow
 * server build runs. The app icon breathes on the same ambient cadence as the
 * cold-start brand overlay over a `RotatingWaitLines` copy block.
 *
 * Mount inside a `position: relative` skeleton container so it centers over
 * the loading shape (see `myEventsSkeleton.tsx`, the Double Booking scan card
 * and `KahStatusSkeleton`). Reveals only after `revealMs` so warm loads never
 * flash it; SSR renders the hidden state, so the client reveal can never
 * mismatch. Purely decorative: `aria-hidden` and pointer-transparent.
 *
 * Recipe + when to wear it: docs/loading-transitions.md §1.4.1.
 */
export function WaitOverlay({
  lines,
  tips,
  revealMs = WAIT_OVERLAY_REVEAL_MS,
}: {
  lines: readonly string[];
  tips?: readonly string[];
  revealMs?: number;
}) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setRevealed(true), revealMs);
    return () => window.clearTimeout(id);
  }, [revealMs]);

  if (!revealed) {
    return null;
  }

  return (
    <div className="c2-wait" aria-hidden="true">
      <Stack className="c2-wait-card c2-glass-surface" gap="xs" align="center">
        <Image src="/icon.svg" alt="" className="c2-wait-icon" draggable={false} />
        <RotatingWaitLines lines={lines} tips={tips} />
      </Stack>
    </div>
  );
}
