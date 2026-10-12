"use client";

import { useCallback, useRef } from "react";
import { Badge, Group, Paper, Pagination, Stack, Text } from "@mantine/core";
import { IconHistory } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { formatLogTimestamp } from "@/lib/audit/format";
import type { CreatedEventSummary } from "@/lib/events/history";
import { CONTENT_ENTER_CLASS, useContentEnter } from "@/lib/loading/contentEnter";
import { useLiveRouteRefresh } from "@/lib/loading/liveRefresh";
import { useMinSkeletonHold } from "@/lib/loading/minHoldLoading";

/** One created event as shown in the My Events list. */
export interface MyEventItem {
  /** Audit row id (stable list key). */
  id: string;
  /** Logical event group id — the per-event history route key. */
  eventId: string;
  /** When the event was created. */
  createdAt: Date;
  /** True when a later `event.delete` row exists for this event. */
  deleted: boolean;
  /** The creation snapshot. */
  summary: CreatedEventSummary;
}

interface MyEventsViewProps {
  items: MyEventItem[];
  page: number;
  pageCount: number;
  total: number;
  /** Configured audit retention window in days (0 = disabled). */
  retentionDays: number;
  /** Server render timestamp — drives the always-fresh re-read gate. */
  renderedAt: number;
}

/**
 * "My Events": every logical event the signed-in user created, newest first,
 * including events later deleted (a Deleted badge) — so a deleted event stays
 * trackable and its full history stays reachable. Always-fresh
 * (docs/event-history.md).
 */
export function MyEventsView({ items, page, pageCount, total, retentionDays, renderedAt }: MyEventsViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const liveRefreshing = useLiveRouteRefresh(renderedAt);
  const loading = useMinSkeletonHold(liveRefreshing);
  const contentRef = useRef<HTMLDivElement | null>(null);
  useContentEnter(contentRef, !loading);

  const goToPage = useCallback(
    (nextPage: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextPage <= 1) {
        params.delete("page");
      } else {
        params.set("page", String(nextPage));
      }
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname);
    },
    [searchParams, pathname, router],
  );

  return (
    <Stack gap="md">
      <PageHeader
        title="My Events"
        subtitle={
          retentionDays > 0
            ? `Events you created · tracked for ${retentionDays} days`
            : "Events you created"
        }
      />

      {total === 0 && !loading ? (
        <EmptyState
          icon={<IconHistory size={20} />}
          description="You haven't created any events yet. Events you create will appear here, and stay listed even after they're deleted."
          actionLabel="Go to calendar"
          actionHref="/dashboard"
        />
      ) : (
        <Stack gap="sm" ref={contentRef} className={CONTENT_ENTER_CLASS}>
          {loading
            ? Array.from({ length: 5 }, (_, index) => (
                <Paper key={index} withBorder p="sm" h={72} />
              ))
            : items.map((item) => (
                <Paper
                  key={item.id}
                  withBorder
                  p="sm"
                  component={Link}
                  href={`/event-history/${item.eventId}`}
                  style={{ display: "block", textDecoration: "none" }}
                >
                  <Stack gap={6}>
                    <Group gap={6} wrap="wrap">
                      <Text fw={600} size="sm">
                        {item.summary.title ?? "Untitled event"}
                      </Text>
                      {item.deleted && (
                        <Badge size="xs" variant="light" color="red">
                          Deleted
                        </Badge>
                      )}
                    </Group>
                    <Text size="sm" c="dimmed">
                      {item.summary.time || "No time recorded"}
                    </Text>
                    <Group gap={6} wrap="wrap">
                      {item.summary.departments.map((name) => (
                        <Badge key={name} size="xs" variant="light" color="accent">
                          {name}
                        </Badge>
                      ))}
                      <Text size="xs" c="dimmed">
                        Created {formatLogTimestamp(item.createdAt)}
                      </Text>
                    </Group>
                  </Stack>
                </Paper>
              ))}
        </Stack>
      )}

      {!loading && pageCount > 1 ? (
        <Stack gap={4} align="center" mt="xs">
          <Pagination
            total={pageCount}
            value={page}
            onChange={goToPage}
            siblings={1}
            boundaries={1}
            withEdges
          />
          <Text size="xs" c="dimmed">
            Page {page} of {pageCount} · {total.toLocaleString()} {total === 1 ? "event" : "events"}
          </Text>
        </Stack>
      ) : null}
    </Stack>
  );
}
