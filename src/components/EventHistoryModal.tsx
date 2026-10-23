"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Group, Modal, Stack, Text, useMantineTheme } from "@mantine/core";
import { useMediaQuery, useViewportSize } from "@mantine/hooks";
import { IconHistory } from "@tabler/icons-react";

import { EmptyState } from "@/components/EmptyState";
import { EventHistoryEntries } from "@/components/EventHistoryEntries";
import { EventHistorySkeleton } from "@/components/EventHistorySkeleton";
import { useMotion } from "@/components/MotionProvider";
import { AUDIT_ACTIONS } from "@/lib/audit/build";
import { createdEventSummary } from "@/lib/events/history";
import { getEventHistory } from "@/lib/events/historyActions";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import { modalContentWidth, type Rect } from "@/lib/motion/origin";
import { modalZoomTransitionProps } from "@/lib/motion/transitions";
import { NARROW_MEDIA_QUERY } from "@/lib/theme";
import type { AuditLog } from "@/db/schema";

interface EventHistoryModalProps {
  /** Logical event group id to show; null keeps the modal closed. */
  eventId: string | null;
  onClose: () => void;
  /** Bounding rect of the tapped trigger; the modal grows out of / shrinks back into it. */
  originRect: Rect | null;
  /** Stacking override for callers nested inside another modal (the dashboard event modal). */
  zIndex?: number;
}

/**
 * The read-only life story of one logical event in a modal: the create row,
 * every subsequent edit (as a before→after diff), and the delete row when it
 * exists. Opened from a My Events row or the event modal's History button
 * (docs/event-history.md §1.3). Rows are fetched fresh on every open —
 * skeleton-only loading, no spinner/dim.
 */
export function EventHistoryModal({ eventId, onClose, originRect, zIndex }: EventHistoryModalProps) {
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const isNarrow = useMediaQuery(NARROW_MEDIA_QUERY);
  const motion = useMotion();
  const viewportSize = useViewportSize();
  const viewport = { w: viewportSize.width, h: viewportSize.height };
  const contentWidth = modalContentWidth(viewport, isNarrow ? 320 : isDesktop ? 520 : 380);
  const transitionProps = modalZoomTransitionProps(motion, originRect, viewport, contentWidth);

  // Loaded rows carry the event id they belong to; `loading` is derived (not
  // set in the effect) so opening a new event never cascades a render. The
  // last content stays mounted through a close so the exit animation has data.
  const [data, setData] = useState<{
    eventId: string;
    rows: AuditLog[];
    retentionDays: number;
  } | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!eventId) {
      return;
    }
    const id = ++requestId.current;
    getEventHistory(eventId)
      .then((result) => {
        if (requestId.current === id) {
          setData({ eventId, rows: result.rows, retentionDays: result.retentionDays });
        }
      })
      .catch(() => {
        if (requestId.current === id) {
          setFailedFor(eventId);
        }
      });
  }, [eventId]);

  const rows = data?.eventId === eventId ? data.rows : null;
  const retentionDays = data?.eventId === eventId ? data.retentionDays : 0;
  const failed = eventId !== null && failedFor === eventId;

  const newest = rows && rows.length > 0 ? rows[rows.length - 1] : undefined;
  const title =
    newest?.entityName ?? (newest ? createdEventSummary(newest.details)?.title : null) ?? "Event history";
  const deleted = newest?.action === AUDIT_ACTIONS.eventDelete;

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
        {rows !== null && (
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
        ) : rows === null ? (
          <EventHistorySkeleton />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<IconHistory size={20} />}
            description="No recorded history for this event. Events are tracked for a limited window, and externally created events are never tracked."
          />
        ) : (
          <EventHistoryEntries rows={rows} />
        )}
      </Stack>
    </Modal>
  );
}
