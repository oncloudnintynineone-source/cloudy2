"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Box, Button, Group, Text, Tooltip, useMantineTheme } from "@mantine/core";
import { useMediaQuery, useViewportSize } from "@mantine/hooks";
import { useRouter } from "next/navigation";
import { IconCalendarEvent, IconHistory } from "@tabler/icons-react";

import { CrossfadeSwap } from "@/components/CrossfadeSwap";
import { EmptyState } from "@/components/EmptyState";
import { EventHistoryEntries } from "@/components/EventHistoryEntries";
import { EventHistorySkeleton } from "@/components/EventHistorySkeleton";
import { MotionModal } from "@/components/MotionModal";
import { useMotion } from "@/components/MotionProvider";
import { createdEventSummary } from "@/lib/events/history";
import { getEventHistory, type EventHistoryResult } from "@/lib/events/historyActions";
import {
  getCachedEventHistory,
  hasCachedEventHistory,
  storeCachedEventHistory,
} from "@/lib/events/historyCache";
import {
  buildHistoryEntries,
  historyCoverageNote,
  type ChangeTrailItem,
  type HistoryEntryItem,
} from "@/lib/events/changeTrail";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import { MIN_SKELETON_HOLD_MS } from "@/lib/loading/minHoldLoading";
import { modalContentWidth, type Rect } from "@/lib/motion/origin";
import { fadeTransitionProps, modalZoomTransitionProps } from "@/lib/motion/transitions";
import { MODAL_SIZE_PX } from "@/lib/motion/useModalZoom";
import type { AuditLog } from "@/db/schema";

/** A row's already-on-screen trail, used to paint the modal instantly. */
export interface EventHistoryPreview {
  title: string;
  deleted: boolean;
  items: ChangeTrailItem[];
}

interface EventHistoryModalProps {
  /** Logical event group id to show; null keeps the modal closed. */
  eventId: string | null;
  onClose: () => void;
  /** Bounding rect of the tapped trigger; the modal grows out of / shrinks back into it. */
  originRect: Rect | null;
  /** Stacking override for callers nested inside another modal (the dashboard event modal). */
  zIndex?: number;
  /**
   * Instant first paint from data the caller already has (a My Events row):
   * the real title, Deleted badge, and collapsed entry headers render before
   * the fetch resolves, then swap silently for the freshly built (expandable)
   * entries — identical headers, so no reflow.
   */
  preview?: EventHistoryPreview | null;
  /** Fallback title before rows arrive (the dashboard event modal has no preview). */
  title?: string;
  /**
   * The dashboard `?event=` deep link for this event. When given, the footer
   * offers "Open in calendar"; a deleted event keeps the button **disabled**
   * (its copies are gone, so the link could not resolve).
   */
  detailLink?: string | null;
  /** Retention known from the caller, so the coverage note paints instantly. */
  retentionDays?: number;
}

/**
 * The read-only life story of one logical event in a modal: the create row,
 * every subsequent edit (as a before→after diff), and the delete row when it
 * exists. Opened from a My Events row or the event modal's History button
 * (docs/event-history.md §1.3). Opens instantly from the `preview` when one is
 * given; rows come from the (hover-prefetched) cache with a background
 * revalidation, so the skeleton only shows on the no-preview cold path.
 *
 * Below `lg` the modal is a **full-height sheet**: reading a trail is the only
 * task on the screen, so it takes the whole viewport instead of a scrolling card
 * floating in a scrolling page. At `lg`+ it is a centered dialog that grows out
 * of the row it was opened from. Either way the event's name rides the sticky
 * header (Mantine's own), so the trail scrolls under it and the reader always
 * knows which event they are reading — one scroller, no nested panes.
 */
export function EventHistoryModal({
  eventId,
  onClose,
  originRect,
  zIndex,
  preview,
  title: titleProp,
  detailLink,
  retentionDays: retentionDaysProp,
}: EventHistoryModalProps) {
  const theme = useMantineTheme();
  const router = useRouter();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const motion = useMotion();
  const viewportSize = useViewportSize();
  const viewport = { w: viewportSize.width, h: viewportSize.height };
  // Below `lg` the sheet fills the viewport, so it grows with a plain fade;
  // only the desktop dialog has a width to grow out of the tapped row from.
  // The shrink target must match the dialog's own `size="lg"` width (620px), or
  // the close animation collapses to a narrower box than the one on screen.
  const transitionProps = isDesktop
    ? modalZoomTransitionProps(
        motion,
        originRect,
        viewport,
        modalContentWidth(viewport, MODAL_SIZE_PX.lg),
      )
    : fadeTransitionProps(motion);

  // Loaded rows carry the event id they belong to; the last content stays
  // mounted through a close so the exit animation has data.
  const [data, setData] = useState<{
    eventId: string;
    rows: AuditLog[];
    items: HistoryEntryItem[];
    retentionDays: number;
  } | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!eventId) {
      return;
    }
    const id = ++requestId.current;
    const fromCache = hasCachedEventHistory(eventId);
    const apply = (result: EventHistoryResult) => {
      setData({
        eventId,
        rows: result.rows,
        // `AuditLog` carries the group id inside `details`; the trail builder
        // takes it as a field (irrelevant here — all rows share this event).
        items: buildHistoryEntries(
          [...result.rows].reverse().map((row) => ({ ...row, eventId })),
          new Date(),
        ),
        retentionDays: result.retentionDays,
      });
      // A successful (re)load clears any earlier failure for this event, so a
      // failed-then-retried open shows the entries instead of the error line.
      setFailedFor(null);
    };
    getCachedEventHistory(eventId)
      .then((result) => {
        if (requestId.current !== id) {
          return;
        }
        apply(result);
        if (fromCache) {
          // Painted from the hover-prefetched cache — revalidate quietly.
          getEventHistory(eventId)
            .then((fresh) => {
              if (requestId.current !== id) {
                return;
              }
              storeCachedEventHistory(eventId, fresh);
              apply(fresh);
            })
            .catch(() => {});
        }
      })
      .catch(() => {
        if (requestId.current === id) {
          setFailedFor(eventId);
        }
      });
  }, [eventId]);

  const loaded = data && data.eventId === eventId ? data : null;
  const previewItems: HistoryEntryItem[] | null = loaded
    ? loaded.items
    : preview
      ? preview.items.map((item) => ({ ...item, details: null }))
      : null;
  // A failed fetch is only worth surfacing when there is nothing to show.
  const failed = eventId !== null && failedFor === eventId && !preview;

  const newest = loaded && loaded.rows.length > 0 ? loaded.rows[loaded.rows.length - 1] : undefined;
  const title =
    newest?.entityName ??
    (newest ? createdEventSummary(newest.details)?.title : null) ??
    preview?.title ??
    titleProp ??
    "Event history";
  const deleted = loaded ? loaded.items[0]?.kind === "delete" : (preview?.deleted ?? false);
  const retentionDays = loaded ? loaded.retentionDays : retentionDaysProp;
  // Only worth saying when the trail is actually truncated: a `Created` entry
  // means the reader is already looking at the event's whole recorded life, and
  // a retention figure they cannot change is not information while nothing is
  // missing.
  const coverageNote = previewItems
    ? historyCoverageNote({ items: previewItems, retentionDays: retentionDays ?? 0 })
    : null;

  return (
    <MotionModal
      opened={eventId !== null}
      onClose={onClose}
      title={
        <span className="c2-hist-title">
          <span className="c2-hist-title-eyebrow">Event history</span>
          <span className="c2-hist-title-row">
            <span className="c2-hist-title-text">{title}</span>
            {deleted ? (
              <Badge component="span" size="xs" variant="light" color="red">
                Deleted
              </Badge>
            ) : null}
          </span>
        </span>
      }
      styles={{ title: { minWidth: 0 } }}
      fullScreen={!isDesktop}
      centered={isDesktop}
      size="lg"
      keepMounted
      zIndex={zIndex}
      transitionProps={transitionProps}
    >
      <Box className={CONTENT_ENTER_CLASS}>
        {failed ? (
          <Text size="sm" c="red">
            Could not load the history. Close and try again.
          </Text>
        ) : (
          <CrossfadeSwap
            loading={eventId !== null && previewItems === null}
            minHoldMs={MIN_SKELETON_HOLD_MS}
            mode="overlay"
            animateHeight
            skeleton={<EventHistorySkeleton />}
          >
            {previewItems !== null ? (
              previewItems.length === 0 ? (
                <EmptyState
                  icon={<IconHistory size={20} />}
                  description="No recorded history for this event. Events are tracked for a limited window, and externally created events are never tracked."
                />
              ) : (
                <EventHistoryEntries items={previewItems} coverageNote={coverageNote} />
              )
            ) : null}
          </CrossfadeSwap>
        )}
        {detailLink ? (
          /* The shared in-body footer recipe (FormFooterActions): same action
             as the read-only detail's "Open in calendar" — the `?event=` deep
             link opens the event's details on the calendar page. A deleted
             event has no copies left to resolve, so the button stays visible
             but disabled; the span wrapper carries the tooltip, as a disabled
             button fires no mouse events and Mantine's Tooltip has no
             disabled-child handling. */
          <Group
            justify="flex-end"
            gap="xs"
            mt="md"
            pt="md"
            style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}
          >
            <Tooltip label="Deleted events can't be opened" disabled={!deleted} withArrow>
              <Box component="span" style={{ display: "inline-flex" }}>
                <Button
                  variant="light"
                  size="md"
                  leftSection={<IconCalendarEvent size={18} />}
                  disabled={deleted}
                  onClick={() => {
                    onClose();
                    router.push(detailLink);
                  }}
                >
                  Open in calendar
                </Button>
              </Box>
            </Tooltip>
          </Group>
        ) : null}
      </Box>
    </MotionModal>
  );
}
