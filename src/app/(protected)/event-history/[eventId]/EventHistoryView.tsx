"use client";

import { useRef } from "react";
import { Badge, Button, Group, Paper, Stack, Text } from "@mantine/core";
import { IconArrowLeft, IconHistory } from "@tabler/icons-react";
import Link from "next/link";

import { AuditDetails } from "@/components/AuditDetails";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { actionLabel, actorLabel, formatLogTimestamp } from "@/lib/audit/format";
import { CONTENT_ENTER_CLASS, useContentEnter } from "@/lib/loading/contentEnter";
import { useLiveRouteRefresh } from "@/lib/loading/liveRefresh";
import { useMinSkeletonHold } from "@/lib/loading/minHoldLoading";
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
 * edit (as a before→after diff), and the delete row when it exists. Always-fresh
 * (see `docs/event-history.md`): the payload is stamped with `renderedAt` and a
 * cache replay forces one live re-read, sharing this route's skeleton.
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
          {ordered.map((row) => (
            <Paper key={row.id} withBorder p="sm">
              <Stack gap="xs">
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
                <AuditDetails details={row.details} />
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
