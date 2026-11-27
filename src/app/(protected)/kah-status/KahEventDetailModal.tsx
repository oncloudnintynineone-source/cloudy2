"use client";

import { useRouter } from "next/navigation";

import { buildEventDeepLink } from "@/lib/events/deepLink";

import { EventDetail } from "../dashboard/EventDetail";
import type { KahEventDetailController } from "./useKahEventDetail";

/**
 * The KAH page's in-place detail modal. Always mounted (so Mantine can play the
 * open/close zoom); `event` toggles while `loading` shows the shaped skeleton.
 * Read-only, like the Double Booking detail — a KAH report never edits anything.
 */
export function KahEventDetailModal({
  controller,
  currentUserId,
  isAdmin,
}: {
  controller: KahEventDetailController;
  currentUserId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  return (
    <EventDetail
      event={controller.detailOpen ? (controller.detail?.event ?? null) : null}
      loading={controller.detailOpen && controller.detailLoading}
      onClose={controller.closeDetail}
      readOnly
      onOpenInCalendar={(event) => {
        router.push(
          buildEventDeepLink({
            view: null,
            start: event.start,
            eventId: event.payload.eventId,
            calendarId: event.payload.calendarId,
          }),
        );
      }}
      peopleNames={controller.detail?.peopleNames ?? {}}
      calendarNames={controller.detail?.calendarNames ?? {}}
      originRect={controller.detailOrigin}
      currentUserId={currentUserId}
      isAdmin={isAdmin}
      myActiveDepartmentIds={controller.detail?.myActiveDepartmentIds ?? []}
      onEdit={() => {}}
      onDuplicate={() => {}}
      onDeleted={() => {}}
      onOptimistic={() => {}}
      onOptimisticSettled={() => {}}
      onOptimisticRollback={() => {}}
    />
  );
}
