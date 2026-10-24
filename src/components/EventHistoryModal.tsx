"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Group, Modal, Stack, Text, useMantineTheme } from "@mantine/core";
import { useMediaQuery, useViewportSize } from "@mantine/hooks";
import { IconHistory } from "@tabler/icons-react";

import { EmptyState } from "@/components/EmptyState";
import { EventHistoryEntries } from "@/components/EventHistoryEntries";
import { EventHistorySkeleton } from "@/components/EventHistorySkeleton";
import { useMotion } from "@/components/MotionProvider";
import { createdEventSummary } from "@/lib/events/history";
import { getEventHistory, type EventHistoryResult } from "@/lib/events/historyActions";
import {
  getCachedEventHistory,
  hasCachedEventHistory,
  storeCachedEventHistory,
} from "@/lib/events/historyCache";
import { buildHistoryEntries, type ChangeTrailItem, type HistoryEntryItem } from "@/lib/events/changeTrail";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import { modalContentWidth, type Rect } from "@/lib/motion/origin";
import { modalZoomTransitionProps } from "@/lib/motion/transitions";
import { NARROW_MEDIA_QUERY } from "@/lib/theme";
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
  /** Retention known from the caller, so the retention line paints instantly. */
  retentionDays?: number;
}

/**
 * The read-only life story of one logical event in a modal: the create row,
 * every subsequent edit (as a before→after diff), and the delete row when it
 * exists. Opened from a My Events row or the event modal's History button
 * (docs/event-history.md §1.3). Opens instantly from the `preview` when one is
 * given; rows come from the (hover-prefetched) cache with a background
 * revalidation, so the skeleton only shows on the no-preview cold path.
 */
export function EventHistoryModal({
  eventId,
  onClose,
  originRect,
  zIndex,
  preview,
  title: titleProp,
  retentionDays: retentionDaysProp,
}: EventHistoryModalProps) {
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const isNarrow = useMediaQuery(NARROW_MEDIA_QUERY);
  const motion = useMotion();
  const viewportSize = useViewportSize();
  const viewport = { w: viewportSize.width, h: viewportSize.height };
  const contentWidth = modalContentWidth(viewport, isNarrow ? 320 : isDesktop ? 520 : 380);
  const transitionProps = modalZoomTransitionProps(motion, originRect, viewport, contentWidth);

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
    (newest?.entityName ??
      (newest ? createdEventSummary(newest.details)?.title : null) ??
      null) ??
    preview?.title ??
    titleProp ??
    "Event history";
  const deleted = loaded ? loaded.items[0]?.kind === "delete" : (preview?.deleted ?? false);
  const retentionDays = loaded ? loaded.retentionDays : retentionDaysProp;

  return (
    <Modal
      opened={eventId !== null}
      onClose={onClose}
      title="Event history"
      centered
      size={isNarrow ? "xs" : isDesktop ? "lg" : "sm"}
      keepMounted
      zIndex={zIndex}
      transitionProps={transitionProps}
    >
      <Stack gap="sm" className={CONTENT_ENTER_CLASS}>
        <Group gap={6} wrap="wrap">
          <Text fw={600}>{title}</Text>
          {deleted && (
            <Badge size="xs" variant="light" color="red">
              Deleted
            </Badge>
          )}
        </Group>
        {retentionDays !== undefined && (
          <Text size="xs" c="dimmed">
            {retentionDays > 0
              ? `Changes are tracked for ${retentionDays} days`
              : "Change tracking is unlimited"}
          </Text>
        )}
        {failed ? (
          <Text size="sm" c="red">
            Could not load the history. Close and try again.
          </Text>
        ) : previewItems === null ? (
          <EventHistorySkeleton />
        ) : previewItems.length === 0 ? (
          <EmptyState
            icon={<IconHistory size={20} />}
            description="No recorded history for this event. Events are tracked for a limited window, and externally created events are never tracked."
          />
        ) : (
          <EventHistoryEntries items={previewItems} />
        )}
      </Stack>
    </Modal>
  );
}
