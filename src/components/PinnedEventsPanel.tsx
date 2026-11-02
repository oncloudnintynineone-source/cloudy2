"use client";

import dynamic from "next/dynamic";
import { Text, useMantineTheme } from "@mantine/core";
import { useMediaQuery, useViewportSize } from "@mantine/hooks";

import { CrossfadeSwap } from "@/components/CrossfadeSwap";
import { MotionModal } from "@/components/MotionModal";
import { useMotion } from "@/components/MotionProvider";
import { loadChunk, useChunkReady } from "@/lib/loading/chunkReady";
import { MIN_SKELETON_HOLD_MS } from "@/lib/loading/minHoldLoading";
import { modalContentWidth } from "@/lib/motion/origin";
import { modalZoomTransitionProps } from "@/lib/motion/transitions";
import { NARROW_MEDIA_QUERY } from "@/lib/theme";
import type { PinnedEvent } from "@/lib/events/pinned";
import { usePinnedPanel } from "@/lib/ui/pinnedPanel";

import { PinnedEventsSkeleton } from "./PinnedEventsSkeleton";

// The list (fetch, seed merge, rows, navigation) is only needed once the panel
// opens. The chrome stays static so the panel zooms out of the header pin
// immediately and the chunk skeleton dissolves inside it
// (docs/loading-transitions.md §1.15.1).
const loadPinnedEventsBody = () =>
  import("./PinnedEventsPanelBody").then((mod) => mod.PinnedEventsPanelBody);
const PinnedEventsPanelBody = dynamic(loadPinnedEventsBody, {
  ssr: false,
  loading: () => null,
});

/** Warm the pinned-panel body chunk on trigger intent / open. */
export function preloadPinnedPanelBody() {
  void loadChunk(loadPinnedEventsBody).catch(() => {});
}

interface PinnedEventsPanelProps {
  /** The shell's current list (the same `fetchPinnedEvents` read backing the
   *  ticker). Seeds the very first open so the panel renders real rows at
   *  their final height instead of a taller-than-content skeleton; the panel's
   *  own fetch still confirms freshness underneath. */
  seedEvents?: PinnedEvent[] | null;
  /** Called with the panel's fresh list after a successful fetch so the shell
   *  can seed the header ticker immediately — a failed mount read then heals
   *  the pill on the first panel open, without waiting for the close refresh. */
  onLoaded?: (events: PinnedEvent[]) => void;
}

export function PinnedEventsPanel({ seedEvents = null, onLoaded }: PinnedEventsPanelProps) {
  const { open, originRect, closePanel } = usePinnedPanel();
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const isNarrow = useMediaQuery(NARROW_MEDIA_QUERY);
  const bodyReady = useChunkReady(loadPinnedEventsBody, open);

  // The modal zooms out of / shrinks back into the header pin button — the
  // app's standard grow/shrink animation. It is `centered` with a fixed size,
  // so the content center is the viewport center and the transform-origin can
  // derive purely from the trigger's rect (see src/lib/motion/origin.ts).
  const motion = useMotion();
  const viewportSize = useViewportSize();
  const viewport = { w: viewportSize.width, h: viewportSize.height };
  // The panel widens md (440px) -> lg (620px) at lg, so the shrink-to-target
  // scale must use the matching content width.
  const contentWidth = modalContentWidth(viewport, isNarrow ? 380 : isDesktop ? 620 : 440);
  const transitionProps = modalZoomTransitionProps(motion, originRect, viewport, contentWidth);

  return (
    <MotionModal
      opened={open}
      onClose={closePanel}
      centered
      size={isNarrow ? "xs" : isDesktop ? "lg" : "md"}
      title={<Text fw={600}>Pinned Events</Text>}
      closeButtonProps={{ "aria-label": "Close pinned events" }}
      transitionProps={transitionProps}
    >
      <CrossfadeSwap
        loading={open && !bodyReady}
        minHoldMs={MIN_SKELETON_HOLD_MS}
        mode="overlay"
        skeleton={<PinnedEventsSkeleton />}
      >
        <PinnedEventsPanelBody seedEvents={seedEvents} onLoaded={onLoaded} />
      </CrossfadeSwap>
    </MotionModal>
  );
}
