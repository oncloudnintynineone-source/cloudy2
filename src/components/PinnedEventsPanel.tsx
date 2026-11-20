"use client";

import dynamic from "next/dynamic";
import { Text } from "@mantine/core";

import { LazyModal } from "@/components/LazyModal";
import { preloadLazyBody, useChunkReady } from "@/lib/loading/chunkReady";
import { useModalZoom } from "@/lib/motion/useModalZoom";
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
  preloadLazyBody(loadPinnedEventsBody);
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
  const bodyReady = useChunkReady(loadPinnedEventsBody, open);

  // The modal zooms out of / shrinks back into the header pin button — the
  // app's standard grow/shrink animation.
  const { size, transitionProps } = useModalZoom({
    originRect,
    spec: { narrow: "xs", mobile: "md", desktop: "lg" },
    contentWidthPx: { narrow: 380 },
  });

  return (
    <LazyModal
      opened={open}
      onClose={closePanel}
      size={size}
      title={<Text fw={600}>Pinned Events</Text>}
      closeLabel="Close pinned events"
      transitionProps={transitionProps}
      ready={bodyReady}
      skeleton={<PinnedEventsSkeleton />}
    >
      <PinnedEventsPanelBody seedEvents={seedEvents} onLoaded={onLoaded} />
    </LazyModal>
  );
}
