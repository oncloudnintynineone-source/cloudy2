"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { CSSProperties } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Group,
  Pagination,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Timeline,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconCalendarEvent,
  IconHistory,
  IconPencil,
  IconPlus,
  IconSearchOff,
  IconTrash,
} from "@tabler/icons-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { CrossfadeSwap } from "@/components/CrossfadeSwap";
import { EmptyState } from "@/components/EmptyState";
import { EventHistoryModal, type EventHistoryPreview } from "@/components/EventHistoryModal";
import { PageHeader } from "@/components/PageHeader";
import { TimeRangeSelect } from "@/components/TimeRangeSelect";
import type { ChangeTrailItem } from "@/lib/events/changeTrail";
import { buildEventDeepLink } from "@/lib/events/deepLink";
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
  /** The active title search ("" = none) — mirrored in `?q=` like range/page. */
  q: string;
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
  q: string;
}

function loadedFrom(props: MyEventsViewProps): LoadedPage {
  return {
    items: props.items,
    page: props.page,
    pageCount: props.pageCount,
    total: props.total,
    rangeMonths: props.rangeMonths,
    q: props.q,
  };
}

/**
 * The dashboard deep link that opens this row's event details (the shared
 * `?event=` link — same shape as event search / Pinned Events). Null for legacy
 * rows without a group id; a deleted row still yields a link, but every caller
 * disables the action for it — the copies are gone, so the link could not
 * resolve.
 */
function rowDetailLink(item: MyEventRow): string | null {
  if (!item.eventId) {
    return null;
  }
  return buildEventDeepLink({
    view: null,
    start: item.sortKey,
    eventId: item.eventId,
    calendarId: item.calendarId,
  });
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
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loaded, setLoaded] = useState<LoadedPage>(() => loadedFrom(props));
  // The window/page/search the user is looking at, set the instant they pick:
  // the control and the header read this, so the change is visible before the
  // data lands. Reverted to the last page that actually loaded when a fetch
  // fails.
  const [selection, setSelection] = useState(() => ({
    rangeMonths: props.rangeMonths,
    page: props.page,
    q: props.q,
  }));
  // The search box's own text — it updates every keystroke, while `selection.q`
  // only follows after a 300 ms pause, so a fast typist doesn't fire a rebuild
  // per character.
  const [searchInput, setSearchInput] = useState(props.q);
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
  // The opened row's details deep link, so the history modal can offer the same
  // "Open in calendar" action as the row itself (disabled there for deleted).
  const [historyDetailLink, setHistoryDetailLink] = useState<string | null>(null);

  const applyLoaded = useCallback((next: LoadedPage) => {
    loadedRef.current = next;
    setLoaded(next);
  }, []);

  const choose = useCallback(
    (next: { rangeMonths: MyEventsRangeMonths; page: number; q: string }) => {
      selectionRef.current = next;
      setSelection(next);
    },
    [],
  );

  /** Open a row's event details on the calendar page (the shared `?event=` deep link). */
  const openInCalendar = useCallback(
    (item: MyEventRow) => {
      // Deleted events have no copies left to open — the row's button is
      // disabled; this guard keeps any other path honest.
      if (item.deleted) {
        return;
      }
      const link = rowDetailLink(item);
      if (link) {
        router.push(link);
      }
    },
    [router],
  );

  /** Rebuild one window/page/search in place, reverting the control when it fails. */
  const load = useCallback(
    (rangeMonths: MyEventsRangeMonths, page: number, q: string) => {
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;
      startTransition(async () => {
        const result = await getMyEventsPage({ rangeMonths, page, q });
        if (requestRef.current !== requestId) {
          return;
        }
        if (result.ok) {
          const {
            items,
            page: next,
            pageCount,
            total,
            rangeMonths: window,
            q: search,
          } = result.data;
          applyLoaded({ items, page: next, pageCount, total, rangeMonths: window, q: search });
          return;
        }
        const { rangeMonths: back, page: backPage, q: backQ } = loadedRef.current;
        choose({ rangeMonths: back, page: backPage, q: backQ });
        notifications.show({ color: "red", message: result.error });
      });
    },
    [applyLoaded, choose],
  );

  /**
   * Mirror the selection into the URL without a router navigation, so a reload
   * or a shared link still opens on this window and search. Next patches
   * `history.replaceState`, so `useSearchParams` and a later `router.refresh()`
   * keep seeing the query the user picked.
   */
  const syncUrl = useCallback(
    (rangeMonths: MyEventsRangeMonths, page: number, q: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("range", String(rangeMonths));
      if (page > 1) {
        params.set("page", String(page));
      } else {
        params.delete("page");
      }
      if (q !== "") {
        params.set("q", q);
      } else {
        params.delete("q");
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
    const current = selectionRef.current;
    choose({ rangeMonths: next, page: 1, q: current.q });
    syncUrl(next, 1, current.q);
    load(next, 1, current.q);
  }

  function changePage(next: number) {
    const current = selectionRef.current;
    if (next === current.page) {
      return;
    }
    choose({ ...current, page: next });
    syncUrl(current.rangeMonths, next, current.q);
    load(current.rangeMonths, next, current.q);
    // What the old navigation gave for free: a long list must not stay scrolled
    // to the page the user just left.
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Apply a title search (C4): back to page 1, mirrored in `?q=` like range. */
  function applySearch(raw: string) {
    const q = raw.trim().slice(0, 100);
    const current = selectionRef.current;
    if (q === current.q) {
      return;
    }
    choose({ rangeMonths: current.rangeMonths, page: 1, q });
    syncUrl(current.rangeMonths, 1, q);
    load(current.rangeMonths, 1, q);
  }

  // Debounced search: the box answers every keystroke, the rebuild waits for a
  // 300 ms pause (and never fires for text that trims to the active search).
  useEffect(() => {
    if (searchInput.trim() === selectionRef.current.q) {
      return;
    }
    const timer = window.setTimeout(() => applySearch(searchInput), 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // A fresh server render (the always-fresh re-read, the header Force refresh)
  // is adopted only when it is the window, page and search the user is looking
  // at; otherwise the view re-reads its own selection through the action. A
  // background refresh can then never snap the list back to a window the user
  // has changed away from, and still always lands fresh rows.
  useEffect(() => {
    if (seenRenderedAt.current === renderedAt) {
      return;
    }
    seenRenderedAt.current = renderedAt;
    const current = selectionRef.current;
    if (
      props.rangeMonths === current.rangeMonths &&
      props.page === current.page &&
      props.q === current.q
    ) {
      applyLoaded(loadedFrom(props));
      setSearchInput(props.q);
      return;
    }
    load(current.rangeMonths, current.page, current.q);
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

      {/* The pinned chrome: the title search + Range control stuck under the
          app header while the event cards scroll beneath it — the shared
          sticky-chrome recipe (`.c2-report-chrome`, `globals.css`; it also
          carries the compact phone block padding). */}
      <Box className="c2-glass-surface c2-report-chrome">
        <Group gap="sm" wrap="wrap">
          {/* Title search (C4): the dashboard event-name filter's semantics,
              applied server-side so paging stays honest; mirrored in `?q=`. */}
          <TextInput
            aria-label="Search your events by title"
            placeholder="Search by title"
            value={searchInput}
            onChange={(e) => setSearchInput(e.currentTarget.value)}
            style={{ flex: 1, minWidth: 200 }}
          />
          <TimeRangeSelect
            label="Range"
            values={MY_EVENTS_RANGE_MONTHS}
            labelFor={myEventsRangeLabel}
            months={selection.rangeMonths}
            onSelect={selectRange}
            disabled={pending}
          />
        </Group>
      </Box>

      <CrossfadeSwap
        loading={loading}
        mode="overlay"
        label="Loading your events"
        skeleton={<MyEventsListSkeleton />}
      >
        {showEmpty ? (
          selection.q !== "" ? (
            <EmptyState
              icon={<IconSearchOff size={20} />}
              description={`No events you created have a title matching "${selection.q}" in this range.`}
              actionLabel="Clear search"
              onAction={() => {
                setSearchInput("");
                applySearch("");
              }}
            />
          ) : (
            <EmptyState
              icon={<IconHistory size={20} />}
              description="No events created in this range. Widen the range above, or create one from the calendar — events you create will appear here, and stay listed even after they're deleted."
              actionLabel="Go to calendar"
              actionHref="/dashboard"
            />
          )
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
                      setHistoryDetailLink(rowDetailLink(row));
                      setHistoryEventId(row.eventId);
                    }}
                    onOpenInCalendar={openInCalendar}
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
        detailLink={historyDetailLink}
        retentionDays={retentionDays}
      />
    </Stack>
  );
}

function MyEventRowView({
  item,
  first,
  onOpenHistory,
  onOpenInCalendar,
}: {
  item: MyEventRow;
  first: boolean;
  onOpenHistory: (item: MyEventRow, rect: Rect | null) => void;
  onOpenInCalendar: (item: MyEventRow) => void;
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

  const tapStyle: CSSProperties = {
    display: "block",
    width: "100%",
    textAlign: "left",
    flex: 1,
    minWidth: 0,
  };

  const eventId = item.eventId;

  return (
    <Group
      gap="xs"
      wrap="nowrap"
      align="flex-start"
      style={{
        padding: "var(--mantine-spacing-sm)",
        borderTop: first ? undefined : LIST_BORDER,
      }}
    >
      {eventId ? (
        <UnstyledButton
          onMouseEnter={() => prefetchEventHistory(eventId)}
          onPointerDown={() => prefetchEventHistory(eventId)}
          onClick={(event) => onOpenHistory(item, event.currentTarget.getBoundingClientRect())}
          style={tapStyle}
        >
          {body}
        </UnstyledButton>
      ) : (
        <Box style={tapStyle}>{body}</Box>
      )}
      {/* Sibling of the tap target (never nested in it): opens the event's
          details on the calendar page. Deleted events have nothing left to
          open, so the action stays visible but disabled. The span wrapper
          carries the tooltip — a disabled button fires no mouse events, and
          Mantine's Tooltip has no disabled-child handling. */}
      {eventId && (
        <Tooltip
          label={item.deleted ? "Deleted events can't be opened" : "Open in calendar"}
          withArrow
          events={{ hover: true, focus: true, touch: false }}
        >
          <Box component="span" style={{ display: "inline-flex", flexShrink: 0, marginTop: 1 }}>
            <ActionIcon
              variant="light"
              color="gray"
              size="lg"
              aria-label="Open in calendar"
              disabled={item.deleted}
              onClick={() => onOpenInCalendar(item)}
            >
              <IconCalendarEvent size={18} />
            </ActionIcon>
          </Box>
        </Tooltip>
      )}
    </Group>
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
