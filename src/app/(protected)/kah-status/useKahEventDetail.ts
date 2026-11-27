"use client";

import { useRef, useState } from "react";
import { notifications } from "@mantine/notifications";

import type { EventClashEntry } from "@/lib/events/clashActions";
import type { CalendarEvent } from "@/lib/events/queries";
import { MIN_SKELETON_HOLD_MS, useMinSkeletonHold } from "@/lib/loading/minHoldLoading";
import type { Rect } from "@/lib/motion/origin";
import { getKahBreachEventDetail } from "@/lib/kah/statusActions";

/** The full payload the in-place read-only `EventDetail` needs. */
export interface KahEventDetail {
  event: CalendarEvent;
  peopleNames: Record<string, string>;
  calendarNames: Record<string, string>;
  myActiveDepartmentIds: string[];
}

/** What `useKahEventDetail` returns — consumed by `KahEventDetailModal`. */
export interface KahEventDetailController {
  detailOpen: boolean;
  detailLoading: boolean;
  detailOrigin: Rect | null;
  detail: KahEventDetail | null;
  openDetail: (entry: EventClashEntry, rect: Rect) => Promise<void>;
  closeDetail: () => void;
}

/**
 * In-place detail state for the KAH breach rows: opens immediately (the modal
 * shows its shaped skeleton), lazily fetches the tapped event's full payload,
 * and supersedes an in-flight fetch on close or another tap so a late result
 * can never reopen a closed modal. Mirrors the Double Booking hook.
 */
export function useKahEventDetail(): KahEventDetailController {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [originRect, setOriginRect] = useState<Rect | null>(null);
  const requestRef = useRef(0);
  const [detail, setDetail] = useState<KahEventDetail | null>(null);
  const heldLoading = useMinSkeletonHold(open && loading, MIN_SKELETON_HOLD_MS);

  async function openDetail(entry: EventClashEntry, rect: Rect) {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setOriginRect(rect);
    setDetail(null);
    setLoading(true);
    setOpen(true);
    try {
      const result = await getKahBreachEventDetail({
        calendarId: entry.calendarId,
        eventId: entry.eventId,
        googleEventId: entry.googleEventId,
        startNaive: entry.effectiveStartNaive,
        endNaive: entry.effectiveEndNaive,
      });
      if (requestId !== requestRef.current) {
        return;
      }
      if (!result.ok) {
        setOpen(false);
        setLoading(false);
        notifications.show({ color: "red", message: result.error });
        return;
      }
      setDetail({
        event: { ...result.event, title: entry.title || result.event.title },
        peopleNames: result.peopleNames,
        calendarNames: result.calendarNames,
        myActiveDepartmentIds: result.myActiveDepartmentIds,
      });
      setLoading(false);
    } catch {
      if (requestId !== requestRef.current) {
        return;
      }
      setOpen(false);
      setLoading(false);
      notifications.show({ color: "red", message: "Could not load the event" });
    }
  }

  function closeDetail() {
    // Supersede any in-flight fetch so a late result can't reopen the modal.
    requestRef.current += 1;
    setOpen(false);
    setLoading(false);
  }

  return {
    detailOpen: open,
    detailLoading: heldLoading,
    detailOrigin: originRect,
    detail,
    openDetail,
    closeDetail,
  };
}
