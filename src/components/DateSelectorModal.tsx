"use client";

import dynamic from "next/dynamic";
import { useMantineTheme } from "@mantine/core";
import { useMediaQuery, useViewportSize } from "@mantine/hooks";

import { CrossfadeSwap } from "@/components/CrossfadeSwap";
import { FormModalSkeleton } from "@/components/FormModalSkeleton";
import { MotionModal } from "@/components/MotionModal";
import { useMotion } from "@/components/MotionProvider";
import type { WeekStart } from "@/lib/events/datetime";
import { loadChunk, useChunkReady } from "@/lib/loading/chunkReady";
import { MIN_SKELETON_HOLD_MS } from "@/lib/loading/minHoldLoading";
import { modalContentWidth, type Rect } from "@/lib/motion/origin";
import { modalZoomTransitionProps } from "@/lib/motion/transitions";
import { NARROW_MEDIA_QUERY } from "@/lib/theme";

import type { DateSelectorKind } from "./DateSelectorModalBody";

export type { DateSelectorKind } from "./DateSelectorModalBody";

// The picker content pulls in `@mantine/dates` + `@mantine/schedule` and is
// only needed after a tap. The chrome stays static so the dialog zooms out of
// the trigger immediately and the chunk skeleton dissolves inside it
// (docs/loading-transitions.md §1.15.1).
const loadDateSelectorBody = () =>
  import("./DateSelectorModalBody").then((mod) => mod.DateSelectorModalBody);
const DateSelectorModalBodyLazy = dynamic(loadDateSelectorBody, {
  ssr: false,
  loading: () => null,
});

/** Warm the picker body chunk on trigger intent or an idle pass. */
export function preloadDateSelectorBody() {
  void loadChunk(loadDateSelectorBody).catch(() => {});
}

interface DateSelectorModalProps {
  opened: boolean;
  /** Picker flavor driven by the active dashboard view. */
  kind: DateSelectorKind;
  /** Anchor value: `YYYY-MM-DD` for day/week, `YYYY-MM` for month. */
  date: string;
  /** Called with `YYYY-MM-DD` (day/week) or `YYYY-MM` (month) when picked. */
  onPick: (value: string) => void;
  onToday: () => void;
  onClose: () => void;
  /** Trigger rect; the dialog grows out of / shrinks back into it. */
  originRect?: Rect | null;
  /** Which day the account's week starts on (default Monday). */
  weekStartsOn?: WeekStart;
}

export function DateSelectorModal({
  opened,
  kind,
  date,
  onPick,
  onToday,
  onClose,
  originRect = null,
  weekStartsOn = "monday",
}: DateSelectorModalProps) {
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const isNarrow = useMediaQuery(NARROW_MEDIA_QUERY);
  const bodyReady = useChunkReady(loadDateSelectorBody, opened);

  const title = kind === "month" ? "Select month" : kind === "week" ? "Select week" : "Select date";

  // The modal zooms out of / shrinks back into the trigger button (the app's
  // standard grow/shrink animation; mirror the filter dialog).
  const motion = useMotion();
  const viewportSize = useViewportSize();
  const viewport = { w: viewportSize.width, h: viewportSize.height };
  const contentWidth = modalContentWidth(viewport, isNarrow ? 300 : isDesktop ? 440 : 380);
  const transitionProps = modalZoomTransitionProps(motion, originRect, viewport, contentWidth);

  return (
    <MotionModal
      opened={opened}
      onClose={onClose}
      title={title}
      centered
      size={isNarrow ? "xs" : isDesktop ? "md" : "sm"}
      transitionProps={transitionProps}
    >
      <CrossfadeSwap
        loading={opened && !bodyReady}
        minHoldMs={MIN_SKELETON_HOLD_MS}
        mode="overlay"
        animateHeight
        skeleton={<FormModalSkeleton rows={6} label="Loading date picker" />}
      >
        <DateSelectorModalBodyLazy
          kind={kind}
          date={date}
          onPick={onPick}
          onToday={onToday}
          onClose={onClose}
          weekStartsOn={weekStartsOn}
        />
      </CrossfadeSwap>
    </MotionModal>
  );
}
