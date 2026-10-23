"use client";

import { useCallback, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  Badge,
  Box,
  Group,
  Pagination,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Timeline,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { IconHistory, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { EmptyState } from "@/components/EmptyState";
import { EventHistoryModal } from "@/components/EventHistoryModal";
import { NoKeyboardSelect } from "@/components/NoKeyboardSelect";
import { PageHeader } from "@/components/PageHeader";
import type { ChangeTrailItem } from "@/lib/events/changeTrail";
import {
  MY_EVENTS_RANGE_MONTHS,
  myEventsRangeLabel,
  type MyEventsRangeMonths,
} from "@/lib/events/myEventsRange";
import type { MyEventRow } from "@/lib/events/myEvents";
import { CONTENT_ENTER_CLASS, useContentEnter } from "@/lib/loading/contentEnter";
import { useLiveRouteRefresh } from "@/lib/loading/liveRefresh";
import { useMinSkeletonHold } from "@/lib/loading/minHoldLoading";
import type { Rect } from "@/lib/motion/origin";

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
 * Each row carries an inline change timeline (Created → Edited → Deleted)
 * showing when every change was made. Always-fresh (docs/event-history.md).
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

  // The shared history modal, opened by tapping a row (replaces the old
  // navigation to the per-event history page).
  const [historyEventId, setHistoryEventId] = useState<string | null>(null);
  const [historyOrigin, setHistoryOrigin] = useState<Rect | null>(null);

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
                      align="flex-start"
                      style={{
                        padding: "var(--mantine-spacing-sm)",
                        borderTop: index === 0 ? undefined : LIST_BORDER,
                      }}
                    >
                      <Skeleton
                        width={4}
                        height={28}
                        radius={2}
                        style={{ flexShrink: 0, marginTop: 1 }}
                      />
                      <Box style={{ flex: 1, minWidth: 0 }}>
                        <Stack gap={8}>
                          <Skeleton
                            height={12}
                            radius={2}
                            style={{ width: `${60 - (index % 3) * 12}%` }}
                          />
                          <Skeleton height={8} radius={2} w="40%" />
                          <Group gap={6}>
                            <Skeleton circle height={18} style={{ flexShrink: 0 }} />
                            <Skeleton height={8} radius={2} w="30%" />
                          </Group>
                          <Group gap={6}>
                            <Skeleton circle height={18} style={{ flexShrink: 0 }} />
                            <Skeleton height={8} radius={2} w="24%" />
                          </Group>
                        </Stack>
                      </Box>
                    </Group>
                  ))
                : items.map((item, index) => (
                    <MyEventRowView
                      key={item.key}
                      item={item}
                      first={index === 0}
                      onOpenHistory={(eventId, rect) => {
                        setHistoryOrigin(rect);
                        setHistoryEventId(eventId);
                      }}
                    />
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

      <EventHistoryModal
        eventId={historyEventId}
        onClose={() => setHistoryEventId(null)}
        originRect={historyOrigin}
      />
    </Stack>
  );
}

function MyEventRowView({
  item,
  first,
  onOpenHistory,
}: {
  item: MyEventRow;
  first: boolean;
  onOpenHistory: (eventId: string, rect: Rect | null) => void;
}) {
  const meta = [item.time, item.departments.join(", ")].filter(Boolean).join(" \u00b7 ");
  const body = (
    <Group gap="sm" wrap="nowrap" align="flex-start">
      <Box
        style={{
          width: 4,
          height: 30,
          borderRadius: 2,
          flexShrink: 0,
          marginTop: 1,
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
        {item.trail.length > 0 && <ChangeTrailTimeline items={item.trail} />}
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
    const eventId = item.eventId;
    return (
      <UnstyledButton
        onClick={(event) => onOpenHistory(eventId, event.currentTarget.getBoundingClientRect())}
        style={rowStyle}
      >
        {body}
      </UnstyledButton>
    );
  }
  return (
    <Box style={rowStyle}>
      {body}
    </Box>
  );
}

/** Trail bullet colors ride the brand palette: created blue, edited amber, deleted red. */
const TRAIL_COLORS: Record<ChangeTrailItem["kind"], string> = {
  create: "brand",
  update: "accent",
  delete: "red",
};

function TrailBullet({ kind }: { kind: ChangeTrailItem["kind"] }) {
  return (
    <ThemeIcon size={16} radius="xl" variant="light" color={TRAIL_COLORS[kind]} aria-hidden>
      {kind === "create" ? (
        <IconPlus size={10} />
      ) : kind === "update" ? (
        <IconPencil size={10} />
      ) : (
        <IconTrash size={10} />
      )}
    </ThemeIcon>
  );
}

/**
 * The inline change timeline (docs/event-history.md §1.4.1): every recorded
 * change of the event, newest first, as compact Timeline items — a colored
 * bullet per kind, the action label, a relative age (absolute UTC+8 stamp on
 * hover/focus), the actor, and the changed fields for an edit.
 */
function ChangeTrailTimeline({ items }: { items: ChangeTrailItem[] }) {
  return (
    <Timeline bulletSize={18} lineWidth={2} mt="xs">
      {items.map((item, index) => (
        <Timeline.Item
          key={`${item.kind}-${item.absolute}-${index}`}
          bullet={<TrailBullet kind={item.kind} />}
        >
          <Group gap={6} wrap="wrap">
            <Text size="xs" fw={600}>
              {item.label}
            </Text>
            <Tooltip
              label={item.absolute}
              withArrow
              events={{ hover: true, focus: true, touch: false }}
            >
              <Text size="xs" c="dimmed" style={{ cursor: "default" }}>
                {item.relative}
              </Text>
            </Tooltip>
            <Text size="xs" c="dimmed">
              {"\u00b7 "}
              {item.actor}
            </Text>
          </Group>
          {item.summary ? (
            <Text size="xs" c="dimmed" lineClamp={1}>
              {item.summary}
            </Text>
          ) : null}
        </Timeline.Item>
      ))}
    </Timeline>
  );
}
