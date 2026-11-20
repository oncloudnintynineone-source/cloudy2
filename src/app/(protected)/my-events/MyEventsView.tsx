"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { CSSProperties } from "react";
import {
  Badge,
  Box,
  Group,
  Pagination,
  Stack,
  Text,
  ThemeIcon,
  Timeline,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconHistory, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { usePathname, useSearchParams } from "next/navigation";

import { CrossfadeSwap } from "@/components/CrossfadeSwap";
import { EmptyState } from "@/components/EmptyState";
import { EventHistoryModal, type EventHistoryPreview } from "@/components/EventHistoryModal";
import { PageHeader } from "@/components/PageHeader";
import { TimeRangeSelect } from "@/components/TimeRangeSelect";
import type { ChangeTrailItem } from "@/lib/events/changeTrail";
import { getMyEventsPage } from "@/lib/events/myEventsActions";
import { prefetchEventHistory } from "@/lib/events/historyCache";
import {
  MY_EVENTS_RANGE_MONTHS,
  myEventsRangeLabel,
  type MyEventsRangeMonths,
} from "@/lib/events/myEventsRange";
import type { MyEventRow } from "@/lib/events/myEvents";
import { useLiveRouteRefresh } from "@/lib/loading/liveRefresh";
import { useMinSkeletonHold } from "@/lib/loading/minHoldLoading";
import type { Rect } from "@/lib/motion/origin";

import { MyEventsListSkeleton } from "./myEventsSkeleton";

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

/** The loaded page — what the list, the empty state and the pager render. */
interface LoadedPage {
  items: MyEventRow[];
  page: number;
  pageCount: number;
  total: number;
  rangeMonths: MyEventsRangeMonths;
}

function loadedFrom(props: MyEventsViewProps): LoadedPage {
  return {
    items: props.items,
    page: props.page,
    pageCount: props.pageCount,
    total: props.total,
    rangeMonths: props.rangeMonths,
  };
}

/**
 * "My Events": every event the signed-in user organized, newest first, over an
 * adjustable ±-months window — including events later deleted (a Deleted badge),
 * so a deleted event stays trackable and its full history stays reachable.
 * Each row carries an inline change timeline (Created → Edited → Deleted)
 * showing when every change was made. Always-fresh (docs/event-history.md).
 *
 * The view owns its page of rows: the route renders the first one, and every
 * change after it — a new window, a page number — is fetched in place through
 * `getMyEventsPage` and swapped in with the skeleton. Navigating instead swaps
 * the whole segment through the route skeleton on a read that can take seconds,
 * which is what made a range change look like it had never applied
 * (docs/event-history.md §1.4.3). The pick itself is optimistic, so the control
 * answers in the same frame and only the list waits.
 */
export function MyEventsView(props: MyEventsViewProps) {
  const { renderedAt, retentionDays } = props;
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [loaded, setLoaded] = useState<LoadedPage>(() => loadedFrom(props));
  // The window/page the user is looking at, set the instant they pick: the
  // control and the header read this, so the change is visible before the data
  // lands. Reverted to the last page that actually loaded when a fetch fails.
  const [selection, setSelection] = useState(() => ({
    rangeMonths: props.rangeMonths,
    page: props.page,
  }));
  const [pending, startTransition] = useTransition();

  // The latest request wins: a fast second pick must not be overwritten by the
  // first one's slower response.
  const requestRef = useRef(0);
  // Mirrors of the two states, so the refresh effect below can read the current
  // values without re-subscribing on every render.
  const selectionRef = useRef(selection);
  const loadedRef = useRef(loaded);
  const seenRenderedAt = useRef(renderedAt);

  const liveRefreshing = useLiveRouteRefresh(renderedAt);
  const loading = useMinSkeletonHold(liveRefreshing || pending);

  // The shared history modal, opened by tapping a row. The row's own trail is
  // passed as a preview so the modal paints instantly, and rows prefetch their
  // full history on hover/press so the tap usually finds it cached.
  const [historyEventId, setHistoryEventId] = useState<string | null>(null);
  const [historyOrigin, setHistoryOrigin] = useState<Rect | null>(null);
  const [historyPreview, setHistoryPreview] = useState<EventHistoryPreview | null>(null);

  const applyLoaded = useCallback((next: LoadedPage) => {
    loadedRef.current = next;
    setLoaded(next);
  }, []);

  const choose = useCallback(
    (next: { rangeMonths: MyEventsRangeMonths; page: number }) => {
      selectionRef.current = next;
      setSelection(next);
    },
    [],
  );

  /** Rebuild one window/page in place, reverting the control when it fails. */
  const load = useCallback(
    (rangeMonths: MyEventsRangeMonths, page: number) => {
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;
      startTransition(async () => {
        const result = await getMyEventsPage({ rangeMonths, page });
        if (requestRef.current !== requestId) {
          return;
        }
        if (result.ok) {
          const { items, page: next, pageCount, total, rangeMonths: window } = result.data;
          applyLoaded({ items, page: next, pageCount, total, rangeMonths: window });
          return;
        }
        choose({ rangeMonths: loadedRef.current.rangeMonths, page: loadedRef.current.page });
        notifications.show({ color: "red", message: result.error });
      });
    },
    [applyLoaded, choose],
  );

  /**
   * Mirror the selection into the URL without a router navigation, so a reload
   * or a shared link still opens on this window. Next patches
   * `history.replaceState`, so `useSearchParams` and a later `router.refresh()`
   * keep seeing the query the user picked.
   */
  const syncUrl = useCallback(
    (rangeMonths: MyEventsRangeMonths, page: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("range", String(rangeMonths));
      if (page > 1) {
        params.set("page", String(page));
      } else {
        params.delete("page");
      }
      const query = params.toString();
      window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
    },
    [pathname, searchParams],
  );

  function selectRange(next: MyEventsRangeMonths) {
    if (next === selectionRef.current.rangeMonths) {
      return;
    }
    choose({ rangeMonths: next, page: 1 });
    syncUrl(next, 1);
    load(next, 1);
  }

  function changePage(next: number) {
    const current = selectionRef.current;
    if (next === current.page) {
      return;
    }
    choose({ ...current, page: next });
    syncUrl(current.rangeMonths, next);
    load(current.rangeMonths, next);
    // What the old navigation gave for free: a long list must not stay scrolled
    // to the page the user just left.
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // A fresh server render (the always-fresh re-read, the header Force refresh)
  // is adopted only when it is the window and page the user is looking at;
  // otherwise the view re-reads its own selection through the action. A
  // background refresh can then never snap the list back to a window the user
  // has changed away from, and still always lands fresh rows.
  useEffect(() => {
    if (seenRenderedAt.current === renderedAt) {
      return;
    }
    seenRenderedAt.current = renderedAt;
    const current = selectionRef.current;
    if (props.rangeMonths === current.rangeMonths && props.page === current.page) {
      applyLoaded(loadedFrom(props));
      return;
    }
    load(current.rangeMonths, current.page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderedAt]);

  const showEmpty = loaded.total === 0 && !loading;

  return (
    <Stack gap="md">
      <PageHeader
        title="My Events"
        subtitle={
          retentionDays > 0
            ? `Events you created · ${myEventsRangeLabel(selection.rangeMonths)} · tracked for ${retentionDays} days`
            : `Events you created · ${myEventsRangeLabel(selection.rangeMonths)}`
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
        <TimeRangeSelect
          label="Range"
          values={MY_EVENTS_RANGE_MONTHS}
          labelFor={myEventsRangeLabel}
          months={selection.rangeMonths}
          onSelect={selectRange}
          disabled={pending}
        />
      </Box>

      <CrossfadeSwap
        loading={loading}
        mode="overlay"
        label="Loading your events"
        skeleton={<MyEventsListSkeleton />}
      >
        {showEmpty ? (
          <EmptyState
            icon={<IconHistory size={20} />}
            description="No events created in this range. Widen the range above, or create one from the calendar — events you create will appear here, and stay listed even after they're deleted."
            actionLabel="Go to calendar"
            actionHref="/dashboard"
          />
        ) : (
          <Stack gap="sm">
            <Box
              style={{
                border: LIST_BORDER,
                borderRadius: "var(--mantine-radius-md)",
                overflow: "hidden",
              }}
            >
              <Stack gap={0}>
                {loaded.items.map((item, index) => (
                  <MyEventRowView
                    key={item.key}
                    item={item}
                    first={index === 0}
                    onOpenHistory={(row, rect) => {
                      if (!row.eventId) {
                        return;
                      }
                      setHistoryOrigin(rect);
                      setHistoryPreview({
                        title: row.title,
                        deleted: row.deleted,
                        items: row.trail,
                      });
                      setHistoryEventId(row.eventId);
                    }}
                  />
                ))}
              </Stack>
            </Box>
          </Stack>
        )}
      </CrossfadeSwap>

      {!loading && loaded.pageCount > 1 ? (
        <Stack gap={4} align="center" mt="xs">
          <Pagination
            total={loaded.pageCount}
            value={selection.page}
            onChange={changePage}
            siblings={1}
            boundaries={1}
            withEdges
          />
          <Text size="xs" c="dimmed">
            Page {selection.page} of {loaded.pageCount} ·{" "}
            {loaded.total.toLocaleString()} {loaded.total === 1 ? "event" : "events"}
          </Text>
        </Stack>
      ) : null}

      <EventHistoryModal
        eventId={historyEventId}
        onClose={() => setHistoryEventId(null)}
        originRect={historyOrigin}
        preview={historyPreview}
        retentionDays={retentionDays}
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
  onOpenHistory: (item: MyEventRow, rect: Rect | null) => void;
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
        onMouseEnter={() => prefetchEventHistory(eventId)}
        onPointerDown={() => prefetchEventHistory(eventId)}
        onClick={(event) => onOpenHistory(item, event.currentTarget.getBoundingClientRect())}
        style={rowStyle}
      >
        {body}
      </UnstyledButton>
    );
  }
  return <Box style={rowStyle}>{body}</Box>;
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
