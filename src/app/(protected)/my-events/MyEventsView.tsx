"use client";

import { useCallback, useRef } from "react";
import { Badge, Group, Paper, Pagination, Stack, Text } from "@mantine/core";
import { IconHistory } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { EmptyState } from "@/components/EmptyState";
import { NoKeyboardSelect } from "@/components/NoKeyboardSelect";
import { PageHeader } from "@/components/PageHeader";
import {
  MY_EVENTS_RANGE_MONTHS,
  myEventsRangeLabel,
  type MyEventsRangeMonths,
} from "@/lib/events/myEventsRange";
import type { MyEventRow } from "@/lib/events/myEvents";
import { CONTENT_ENTER_CLASS, useContentEnter } from "@/lib/loading/contentEnter";
import { useLiveRouteRefresh } from "@/lib/loading/liveRefresh";
import { useMinSkeletonHold } from "@/lib/loading/minHoldLoading";

interface MyEventsViewProps {
  /** One page of the combined live + deleted list, newest first. */
  items: MyEventRow[];
  page: number;
  pageCount: number;
  total: number;
  rangeMonths: MyEventsRangeMonths;
  /** Server render timestamp — drives the always-fresh re-read gate. */
  renderedAt: number;
  /** Configured audit retention window in days (0 = disabled). */
  retentionDays: number;
}

/**
 * "My Events": every event the signed-in user organized, newest first, over an
 * adjustable ±-months window — including events later deleted (a Deleted badge),
 * so a deleted event stays trackable and its full history stays reachable.
 * Always-fresh (docs/event-history.md).
 */
export function MyEventsView({
  items,
  page,
  pageCount,
  total,
  rangeMonths,
  renderedAt,
  retentionDays,
}: MyEventsViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const liveRefreshing = useLiveRouteRefresh(renderedAt);
  const loading = useMinSkeletonHold(liveRefreshing);
  const contentRef = useRef<HTMLDivElement | null>(null);
  useContentEnter(contentRef, !loading);

  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname);
    },
    [searchParams, pathname, router],
  );

  const showEmpty = total === 0 && !loading;

  return (
    <Stack gap="md">
      <PageHeader
        title="My Events"
        subtitle={
          retentionDays > 0
            ? `Events you created · ${myEventsRangeLabel(rangeMonths)} · tracked for ${retentionDays} days`
            : `Events you created · ${myEventsRangeLabel(rangeMonths)}`
        }
      />

      <NoKeyboardSelect
        label="Range"
        size="xs"
        w={150}
        allowDeselect={false}
        value={String(rangeMonths)}
        onChange={(value) => setParams({ range: value ?? null, page: null })}
        data={MY_EVENTS_RANGE_MONTHS.map((months) => ({
          value: String(months),
          label: myEventsRangeLabel(months),
        }))}
      />

      {showEmpty ? (
        <EmptyState
          icon={<IconHistory size={20} />}
          description="No events created in this range. Widen the range above, or create one from the calendar — events you create will appear here, and stay listed even after they're deleted."
          actionLabel="Go to calendar"
          actionHref="/dashboard"
        />
      ) : (
        <Stack gap="sm" ref={contentRef} className={CONTENT_ENTER_CLASS}>
          {loading
            ? Array.from({ length: 5 }, (_, index) => (
                <Paper key={index} withBorder p="sm" h={72} />
              ))
            : items.map((item) => <MyEventCard key={item.key} item={item} />)}
        </Stack>
      )}

      {!loading && pageCount > 1 ? (
        <Stack gap={4} align="center" mt="xs">
          <Pagination
            total={pageCount}
            value={page}
            onChange={(next) => setParams({ page: next <= 1 ? null : String(next) })}
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

function MyEventCard({ item }: { item: MyEventRow }) {
  const body = (
    <Stack gap={6}>
      <Group gap={6} wrap="wrap">
        <Text fw={600} size="sm">
          {item.title}
        </Text>
        {item.deleted && (
          <Badge size="xs" variant="light" color="red">
            Deleted
          </Badge>
        )}
      </Group>
      <Text size="sm" c="dimmed">
        {item.time || "No time recorded"}
      </Text>
      {item.departments.length > 0 && (
        <Group gap={6} wrap="wrap">
          {item.departments.map((name) => (
            <Badge key={name} size="xs" variant="light" color="accent">
              {name}
            </Badge>
          ))}
        </Group>
      )}
    </Stack>
  );

  if (item.eventId) {
    return (
      <Paper
        withBorder
        p="sm"
        component={Link}
        href={`/event-history/${item.eventId}`}
        style={{ display: "block", textDecoration: "none" }}
      >
        {body}
      </Paper>
    );
  }
  return (
    <Paper withBorder p="sm">
      {body}
    </Paper>
  );
}
