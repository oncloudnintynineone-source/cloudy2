"use client";

import { useId, useRef, useState } from "react";
import { Badge, Box, Button, Collapse, Group, Paper, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconArrowLeft, IconChevronDown, IconHistory } from "@tabler/icons-react";
import Link from "next/link";

import { AuditDetails } from "@/components/AuditDetails";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { actionLabel, actorLabel, formatAuditDetails, formatLogTimestamp } from "@/lib/audit/format";
import { CONTENT_ENTER_CLASS, useContentEnter } from "@/lib/loading/contentEnter";
import { useLiveRouteRefresh } from "@/lib/loading/liveRefresh";
import { useMinSkeletonHold } from "@/lib/loading/minHoldLoading";
import { useMotion } from "@/components/MotionProvider";
import type { AuditLog } from "@/db/schema";

import { EventHistorySkeleton } from "./EventHistorySkeleton";

interface EventHistoryViewProps {
  /** Rendered title of the newest recorded version of the event. */
  title: string;
  /** Audit rows for this logical event, oldest first (server order). */
  events: AuditLog[];
  /** Server render timestamp — drives the always-fresh re-read gate. */
  renderedAt: number;
  /** Configured audit retention window in days (0 = disabled). */
  retentionDays: number;
  /** Where the "Back" action returns to. */
  backHref: string;
}

/**
 * Read-only life story of one logical event: the create row, every subsequent
 * edit (as a before→after diff), and the delete row when it exists. Each entry
 * is a collapsible disclosure (all collapsed by default); always-fresh (see
 * docs/event-history.md): the payload is stamped with `renderedAt` and a cache
 * replay forces one live re-read, sharing this route's skeleton.
 */
export function EventHistoryView({
  title,
  events,
  renderedAt,
  retentionDays,
  backHref,
}: EventHistoryViewProps) {
  const liveRefreshing = useLiveRouteRefresh(renderedAt);
  const loading = useMinSkeletonHold(liveRefreshing);
  const contentRef = useRef<HTMLDivElement | null>(null);
  useContentEnter(contentRef, !loading);

  // Newest first reads like a changelog; the server returns oldest-first.
  const ordered = [...events].reverse();

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <PageHeader
          title={title}
          subtitle={
            retentionDays > 0
              ? `Changes are tracked for ${retentionDays} days`
              : "Change tracking is unlimited"
          }
        />
        <Button
          variant="subtle"
          size="sm"
          leftSection={<IconArrowLeft size={16} />}
          component={Link}
          href={backHref}
        >
          Back
        </Button>
      </Group>

      {loading ? (
        <EventHistorySkeleton />
      ) : ordered.length === 0 ? (
        <EmptyState
          icon={<IconHistory size={20} />}
          description="No recorded history for this event. Events are tracked for a limited window, and externally created events are never tracked."
          actionLabel="Back to calendar"
          actionHref="/dashboard"
        />
      ) : (
        <Stack gap="sm" ref={contentRef} className={CONTENT_ENTER_CLASS}>
          {ordered.map((row) => <HistoryEntry key={row.id} row={row} />)}
        </Stack>
      )}
    </Stack>
  );
}

/**
 * One collapsible history entry: an always-visible header (action, timestamp,
 * actor, and a one-line summary of what changed) that toggles the full
 * before→after detail. Collapsed by default — every entry opens only on tap.
 * Follows the shared disclosure recipe used by `ClashCard`
 * (`src/components/clashCards.tsx`).
 */
function HistoryEntry({ row }: { row: AuditLog }) {
  const motion = useMotion();
  const [open, setOpen] = useState(false);
  const regionId = useId();
  const summary = changeSummary(row.details, row.entityName ?? null);
  return (
    <Paper withBorder p="sm">
      <UnstyledButton
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={regionId}
        style={{ width: "100%", textAlign: "left" }}
      >
        <Group justify="space-between" align="flex-start" gap="xs" wrap="nowrap">
          <Stack gap={4} style={{ flexGrow: 1, minWidth: 0 }}>
            <Group gap={6} wrap="wrap">
              <Text size="sm" fw={600}>
                {actionLabel(row.action)}
              </Text>
              <Badge size="xs" variant="light" color="brand">
                {formatLogTimestamp(row.createdAt)}
              </Badge>
            </Group>
            <Text size="xs" c="dimmed">
              {actorLabel(row)}
            </Text>
            {summary ? (
              <Text size="xs" c="dimmed" lineClamp={1}>
                {summary}
              </Text>
            ) : null}
          </Stack>
          <IconChevronDown
            size={16}
            style={{
              flexShrink: 0,
              marginTop: 2,
              transform: open ? "rotate(180deg)" : undefined,
              transition: `transform ${motion.duration.micro}ms ${motion.easing.out}`,
            }}
            aria-hidden
          />
        </Group>
      </UnstyledButton>
      <Collapse
        expanded={open}
        id={regionId}
        transitionDuration={motion.duration.popover}
        transitionTimingFunction={motion.easing.out}
        keepMounted={false}
      >
        <Box mt="xs">
          <AuditDetails details={row.details} />
        </Box>
      </Collapse>
    </Paper>
  );
}

/**
 * A concise one-line summary for a collapsed entry: the changed field labels
 * for an edit (from the shared `FieldDiff` shaping), or the event title for a
 * create/delete snapshot. Null when there is nothing useful to show.
 */
function changeSummary(details: unknown, entityName: string | null): string | null {
  const formatted = formatAuditDetails(details);
  if (formatted.kind === "changes") {
    return formatted.lines.length > 0
      ? formatted.lines.map((line) => line.label).join(", ")
      : null;
  }
  return entityName;
}
