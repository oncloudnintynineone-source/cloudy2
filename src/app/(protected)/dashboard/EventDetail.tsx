"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import { CrossfadeSwap } from "@/components/CrossfadeSwap";
import { MotionModal } from "@/components/MotionModal";
import { preloadLazyBody, useChunkReady } from "@/lib/loading/chunkReady";
import { MIN_SKELETON_HOLD_MS } from "@/lib/loading/minHoldLoading";
import { useModalZoom } from "@/lib/motion/useModalZoom";

import type { EventDetailProps } from "./EventDetailBody";
import { EventDetailSkeleton } from "./EventDetailSkeleton";

// The detail body (actions, registration, history/share and the .ics helpers)
// is only needed once an event opens. The chrome stays static so the dialog
// zooms out of the tapped chip immediately and the chunk skeleton dissolves
// inside it (docs/loading-transitions.md §1.15.1).
const loadEventDetailBody = () =>
  import("./EventDetailBody").then((mod) => mod.EventDetailBody);
const EventDetailBody = dynamic(loadEventDetailBody, { ssr: false, loading: () => null });

/** Warm the event-detail body chunk on chip intent or the idle pass. */
export function preloadEventDetailBody() {
  preloadLazyBody(loadEventDetailBody);
}

export function EventDetail({
  event,
  onClose,
  onEdit,
  onDuplicate,
  onDeleted,
  onOptimistic,
  onOptimisticSettled,
  onOptimisticRollback,
  peopleNames,
  calendarNames,
  originRect,
  currentUserId,
  isAdmin,
  myActiveDepartmentIds,
  readOnly = false,
  onOpenInCalendar,
  onRegistrationChanged,
  onViewDeletedHistory,
  loading = false,
  zIndex,
}: EventDetailProps) {
  const bodyReady = useChunkReady(loadEventDetailBody, loading || event !== null);

  // The modal is `centered` with a fixed size, so its content center is the
  // viewport center; the transform-origin can therefore be derived purely from
  // the clicked element's rect (see src/lib/motion/origin.ts). The modal
  // widens xs (320px) -> sm (380px) -> md (440px): xs on very small phones,
  // sm on regular mobile, md at lg, matching the shrink scale.
  const { size, transitionProps } = useModalZoom({
    originRect,
    spec: { narrow: "xs", mobile: "sm", desktop: "md" },
  });

  const opened = loading || event !== null;
  // Some pages mount this modal while closed (Double Booking / KAH / Parade).
  // Mount the lazy body only after the first real open so those pages do not
  // download its chunk on load; `keepMounted` then preserves it for the exit
  // animation and for state that must survive close (the last shown event).
  const [everOpened, setEverOpened] = useState(opened);
  if (opened && !everOpened) {
    setEverOpened(true);
  }

  return (
    <MotionModal
      opened={opened}
      onClose={onClose}
      title="Event"
      centered
      size={size}
      keepMounted
      zIndex={zIndex}
      transitionProps={transitionProps}
    >
      {everOpened ? (
        <CrossfadeSwap
          loading={opened && !bodyReady}
          minHoldMs={MIN_SKELETON_HOLD_MS}
          mode="overlay"
          animateHeight
          skeleton={<EventDetailSkeleton />}
        >
          <EventDetailBody
            event={event}
            onEdit={onEdit}
            onDuplicate={onDuplicate}
            onDeleted={onDeleted}
            onOptimistic={onOptimistic}
            onOptimisticSettled={onOptimisticSettled}
            onOptimisticRollback={onOptimisticRollback}
            peopleNames={peopleNames}
            calendarNames={calendarNames}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            myActiveDepartmentIds={myActiveDepartmentIds}
            readOnly={readOnly}
            onOpenInCalendar={onOpenInCalendar}
            onRegistrationChanged={onRegistrationChanged}
            onViewDeletedHistory={onViewDeletedHistory}
            loading={loading}
          />
        </CrossfadeSwap>
      ) : null}
    </MotionModal>
  );
}
