"use client";

import dynamic from "next/dynamic";

import { FormModalSkeleton } from "@/components/FormModalSkeleton";
import { LazyModal } from "@/components/LazyModal";
import type { WeekStart } from "@/lib/events/datetime";
import { preloadLazyBody, useChunkReady } from "@/lib/loading/chunkReady";
import type { Rect } from "@/lib/motion/origin";
import { useModalZoom } from "@/lib/motion/useModalZoom";

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
  preloadLazyBody(loadDateSelectorBody);
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
  const bodyReady = useChunkReady(loadDateSelectorBody, opened);

  const title = kind === "month" ? "Select month" : kind === "week" ? "Select week" : "Select date";

  // The modal zooms out of / shrinks back into the trigger button (the app's
  // standard grow/shrink animation; mirror the filter dialog).
  const { size, transitionProps } = useModalZoom({
    originRect,
    spec: { narrow: "xs", mobile: "sm", desktop: "md" },
    contentWidthPx: { narrow: 300 },
  });

  return (
    <LazyModal
      opened={opened}
      onClose={onClose}
      title={title}
      size={size}
      transitionProps={transitionProps}
      ready={bodyReady}
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
    </LazyModal>
  );
}
