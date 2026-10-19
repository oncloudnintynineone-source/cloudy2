"use client";

import { useCallback, useRef } from "react";
import type { CSSProperties } from "react";
import { Badge, Box, Group, Paper, Pagination, Skeleton, Stack, Text } from "@mantine/core";
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

const LIST_BORDER = "1px solid var(--mantine-color-default-border)";

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

      {/* The pinned chrome: the Range control stuck under the app header while
          the event cards scroll beneath it — the shared sticky-chrome recipe
          (docs/dashboard-views.md, SettingsTabs). */}
      <Box
        className="c2-glass-surface"
        style={{
          position: "sticky",
          top: "var(--app-shell-header-offset)",
          zIndex: 9,
          borderBottom: "1px solid var(--mantine-color-default-border)",
          marginInline: "calc(-1 * var(--app-shell-padding))",
          marginTop: "calc(-1 * var(--app-shell-padding))",
          paddingInline: "var(--app-shell-padding)",
          paddingTop: "var(--mantine-spacing-md)",
          paddingBottom: "var(--mantine-spacing-md)",
        }}
      >
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
      </Box>

      {showEmpty ? (
        <EmptyState
          icon={<IconHistory size={20} />}
          description="No events created in this range. Widen the range above, or create one from the calendar — events you create will appear here, and stay listed even after they're deleted."
          actionLabel="Go to calendar"
          actionHref="/dashboard"
        />
      ) : (
        <Stack gap="sm" ref={contentRef} className={CONTENT_ENTER_CLASS}>
          <Box
            style={{
              border: LIST_BORDER,
              borderRadius: "var(--mantine-radius-md)",
              overflow: "hidden",
            }}
          >
            <Stack gap={0}>
              {loading
                ? Array.from({ length: 5 }, (_, index) => (
                    <Group
                      key={index}
                      gap="sm"
                      wrap="nowrap"
                      align="center"
                      style={{
                        padding: "var(--mantine-spacing-sm)",
                        borderTop: index === 0 ? undefined : LIST_BORDER,
                      }}
                    >
                      <Skeleton width={4} height={28} radius={2} style={{ flexShrink: 0 }} />
                      <Skeleton height={12} radius={2} style={{ width: `${60 - (index % 3) * 12}%` }} />
                    </Group>
                  ))
                : items.map((item, index) => (
                    <MyEventRowView key={item.key} item={item} first={index === 0} />
                  ))}
            </Stack>
          </Box>
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

function MyEventRowView({ item, first }: { item: MyEventRow; first: boolean }) {
  const meta = [item.time, item.departments.join(", ")].filter(Boolean).join(" \u00b7 ");
  const body = (
    <Group gap="sm" wrap="nowrap" align="center">
      <Box
        style={{
          width: 4,
          height: 30,
          borderRadius: 2,
          flexShrink: 0,
          background: `var(--mantine-color-${item.deleted ? "red" : item.color}-filled)`,
        }}
      />
      <Box style={{ minWidth: 0, flex: 1 }}>
        <Group gap={6}>
          <Text fw={600} size="sm" truncate>
            {item.title}
          </Text>
          {item.deleted && (
            <Badge size="xs" variant="light" color="red">
              Deleted
            </Badge>
          )}
        </Group>
        {meta && (
          <Text size="xs" c="dimmed" truncate>
            {meta}
          </Text>
        )}
      </Box>
    </Group>
  );

  const rowStyle: CSSProperties = {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "var(--mantine-spacing-sm)",
    borderTop: first ? undefined : LIST_BORDER,
  };

  if (item.eventId) {
    return (
      <Paper
        component={Link}
        href={`/event-history/${item.eventId}`}
        style={{ ...rowStyle, textDecoration: "none" }}
      >
        {body}
      </Paper>
    );
  }
  return (
    <Box style={rowStyle}>
      {body}
    </Box>
  );
}
