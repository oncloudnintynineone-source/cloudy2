"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Menu,
  Modal,
  Skeleton,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
  useMantineTheme,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useMediaQuery, useViewportSize } from "@mantine/hooks";
import { IconCalendar, IconSearch, IconSearchOff, IconX } from "@tabler/icons-react";
import dayjs from "dayjs";
import { NARROW_MEDIA_QUERY } from "@/lib/theme";

import { buildEventDeepLink } from "@/lib/events/deepLink";
import { formatInstantToNaive } from "@/lib/events/datetime";
import type { CalendarEvent } from "@/lib/events/queries";
import { searchEvents } from "@/lib/events/search";
import {
  addSearchHistoryEntry,
  removeSearchHistoryEntry,
} from "@/lib/events/searchHistory";
import {
  getSearchHistory,
  recordSearchHistory,
  removeSearchHistory,
} from "@/lib/events/searchHistoryActions";
import {
  defaultSearchFrom,
  defaultSearchTo,
  SEARCH_MIN_QUERY_LENGTH,
} from "@/lib/events/searchRange";
import {
  modalContentWidth,
  scaleFromRect,
  transformOriginFromRect,
  type Rect,
} from "@/lib/motion/origin";
import { MOTION } from "@/lib/motion/timing";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";

import { EmptyState } from "./EmptyState";
import { LoadingStatus } from "./LoadingStatus";

interface EventSearchModalProps {
  opened: boolean;
  onClose: () => void;
  originRect: Rect | null;
}

const LIST_BORDER = "1px solid var(--mantine-color-default-border)";

/**
 * How many result rows to mount at once. A broad query across every calendar
 * can return hundreds of events, so the list is paged to keep the DOM (and the
 * initial paint on a low-end phone) bounded. "Show more" reveals the rest.
 */
const RESULT_PAGE_SIZE = 150;

/** One human-readable "when" line for a result row (date + time / all-day). */
function eventWhenLabel(event: CalendarEvent): string {
  const start = dayjs(event.start);
  const dateLabel = start.format("ddd, D MMM YYYY");
  if (event.payload.allDay) {
    return `${dateLabel} · All day`;
  }
  const end = dayjs(event.end);
  const timeLabel = start.isSame(end, "day")
    ? `${start.format("HH:mm")}–${end.format("HH:mm")}`
    : `${start.format("HH:mm")}–${end.format("D MMM, HH:mm")}`;
  return `${dateLabel} · ${timeLabel}`;
}

export default function EventSearchModal({ opened, onClose, originRect }: EventSearchModalProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const isNarrow = useMediaQuery(NARROW_MEDIA_QUERY);
  const today = formatInstantToNaive(new Date()).slice(0, 10);
  const defaultFrom = defaultSearchFrom(today);
  const defaultTo = defaultSearchTo(today);

  const [query, setQuery] = useState("");
  const [from, setFrom] = useState<string | null>(defaultFrom);
  const [to, setTo] = useState<string | null>(defaultTo);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CalendarEvent[] | null>(null);
  const [visibleCount, setVisibleCount] = useState(RESULT_PAGE_SIZE);
  // The current user's own events (tagged attendee) among the results — drives
  // the amber "mine" row highlight, matching the dashboard agenda.
  const [myEventIds, setMyEventIds] = useState<string[]>([]);
  // The [from, to] window a completed search actually ran with (defaults
  // resolved), shown beside the result count so the scope is never ambiguous.
  const [searchedRange, setSearchedRange] = useState<{ from: string; to: string } | null>(null);
  // The user's recent queries (`null` = not yet fetched). Prefetched when the
  // modal first mounts (closed, at idle) so the badges are already present on
  // the first open, then refreshed on each open so queries from other devices
  // surface here too.
  const [history, setHistory] = useState<string[] | null>(null);

  // The clicked result row whose deep-link navigation is in flight. Its position
  // (in the results list's content coordinates) drives an overlay spinner that
  // covers exactly that row — sized to the row, so nothing shifts — until the
  // dashboard's event detail is ready, then the search modal closes. Positional
  // (not id-based), so a multi-day event repeated under several date headers
  // never lights more than the row the user actually clicked.
  const [opening, setOpening] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();

  // The shell lazy-mounts this modal (closed) as soon as its chunk preloads, so
  // the Modal's Mantine Transition would initialize to "entered" and the zoom-in
  // from the header button would never play. Mirror the `opened` prop into a
  // local `mounted` state so the Transition always has an "exited" start state.
  // The open flip is deferred by one animation frame: flipped synchronously in
  // the effect, the browser coalesces the enter rAFs into a single paint and the
  // zoom still never plays. Closing flips immediately so the shrink-out doesn't
  // lag; later opens take the same deferred path.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (!opened) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMounted(false);
      return;
    }
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, [opened]);

  useEffect(() => {
    if (!isPending && opening !== null) {
      // The navigation transition finished — clear the row spinner and close
      // the modal. `isPending` is React's external transition signal, so the
      // state write here is genuine effect synchronization.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpening(null);
      onClose();
    }
  }, [isPending, opening, onClose]);

  // A closed modal should come back fresh, not with the previous search still
  // listed (the shell keeps it mounted after first open). Track the last-seen
  // `opened` value and reset the search state on the close transition.
  const [prevOpened, setPrevOpened] = useState(opened);
  if (opened !== prevOpened) {
    setPrevOpened(opened);
    if (!opened) {
      setQuery("");
      setResults(null);
      setMyEventIds([]);
      setSearchedRange(null);
      setError(null);
      setOpening(null);
      setVisibleCount(RESULT_PAGE_SIZE);
    }
  }

  // Prefetch recent searches once, when the modal first mounts (closed, at
  // idle) so the first open shows the badges immediately instead of after a
  // server round trip. Best-effort; a failure keeps the last list.
  useEffect(() => {
    let cancelled = false;
    getSearchHistory()
      .then((result) => {
        if (!cancelled && result.ok) {
          setHistory(result.history);
        }
      })
      .catch(() => {
        // Keep the last known list.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Refresh on every open so queries run on other devices (or cleared
  // elsewhere) surface here.
  useEffect(() => {
    if (!opened) {
      return;
    }
    let cancelled = false;
    getSearchHistory()
      .then((result) => {
        if (!cancelled && result.ok) {
          setHistory(result.history);
        }
      })
      .catch(() => {
        // Keep the last known list.
      });
    return () => {
      cancelled = true;
    };
  }, [opened]);

  // The modal zooms out of / shrinks back into the header search button (the
  // app's standard grow/shrink animation; mirror PinnedEventsPanel).
  // Resize-subscribed viewport (Mantine hook) rather than a raw window read
  // during render.
  const viewportSize = useViewportSize();
  const viewport = { w: viewportSize.width, h: viewportSize.height };
  const contentWidth = modalContentWidth(viewport, isNarrow ? 380 : isDesktop ? 620 : 440);
  const transitionProps = {
    transition: {
      in: { opacity: 1, transform: "scale(1)" },
      out: { opacity: 0, transform: `scale(${scaleFromRect(originRect, contentWidth)})` },
      common: { transformOrigin: transformOriginFromRect(originRect, viewport, "center") },
      transitionProperty: "transform, opacity",
    },
    duration: MOTION.modalZoom,
    exitDuration: MOTION.modalZoomExit,
    timingFunction: "cubic-bezier(0.3, 1.2, 0.4, 1)",
  } as const;

  async function runSearch(term: string) {
    const trimmed = term.trim();
    if (trimmed.length < SEARCH_MIN_QUERY_LENGTH) {
      setError(`Enter at least ${SEARCH_MIN_QUERY_LENGTH} characters to search`);
      return;
    }
    if (loading) {
      return;
    }
    setError(null);
    setLoading(true);
    // Resolve the window locally so the result header can name the scope even
    // though the server owns the final coercion.
    const effectiveFrom = from || defaultFrom;
    const effectiveTo = to || defaultTo;
    try {
      const result = await searchEvents(trimmed, from ?? "", to ?? "");
      if (result.ok) {
        setResults(result.events);
        setVisibleCount(RESULT_PAGE_SIZE);
        setMyEventIds(result.myEventIds);
        setSearchedRange({ from: effectiveFrom, to: effectiveTo });
        // Remember the query server-side (fire-and-forget) and update the local
        // badge list optimistically.
        void recordSearchHistory(trimmed);
        setHistory((prev) => addSearchHistoryEntry(prev ?? [], trimmed));
      } else {
        setError(result.error);
      }
    } catch {
      setError("Search failed, please try again");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await runSearch(query);
  }

  // A result click navigates to the dashboard and opens that event's full
  // detail modal (Duplicate/Edit/Delete). While the navigation is in flight an
  // overlay spinner covers the clicked row (see `opening` above), then the
  // search modal closes. The row itself stays clickable the whole time.
  function handleEventClick(event: unknown, e: React.MouseEvent<HTMLButtonElement>) {
    const calendarEvent = event as CalendarEvent;
    const list = listRef.current;
    if (list) {
      const rowRect = e.currentTarget.getBoundingClientRect();
      const listRect = list.getBoundingClientRect();
      setOpening({
        top: rowRect.top - listRect.top - list.clientTop + list.scrollTop,
        left: rowRect.left - listRect.left - list.clientLeft + list.scrollLeft,
        width: rowRect.width,
        height: rowRect.height,
      });
    }
    // Carry the currently active dashboard tab (`?view=`) so opening the result
    // can never fall back to the remembered tab and silently switch views. The
    // search covers every calendar, but the active filters may exclude the
    // event; `_eventCal` lets the server resolve that one event separately.
    const href = buildEventDeepLink({
      view: pathname === "/dashboard" ? searchParams.get("view") : null,
      start: calendarEvent.start,
      eventId: calendarEvent.payload.eventId,
      calendarId: calendarEvent.payload.calendarId,
    });
    startTransition(() => {
      router.push(href);
    });
  }

  const visibleResults = results ? results.slice(0, visibleCount) : null;

  // The user's own rows get the amber highlight, external (Google-made) rows
  // the purple one — the same classes the dashboard agenda uses.
  const myIdSet = useMemo(() => new Set(myEventIds), [myEventIds]);

  const rangeChanges =
    ((from || defaultFrom) !== defaultFrom ? 1 : 0) + ((to || defaultTo) !== defaultTo ? 1 : 0);
  const showRecent = history !== null && history.length > 0 && (results === null || results.length === 0);
  const rangeLabel = searchedRange
    ? `${dayjs(searchedRange.from).format("D MMM YYYY")} – ${dayjs(searchedRange.to).format("D MMM YYYY")}`
    : "";

  return (
    <Modal
      opened={mounted}
      onClose={onClose}
      title="Search events"
      centered
      size={isNarrow ? "xs" : isDesktop ? "lg" : "md"}
      transitionProps={transitionProps}
      closeButtonProps={{ "aria-label": "Close search" }}
    >
      {/* One bounded column: a fixed one-row toolbar (input + Search + date
          filter), then the result list as the only scroll region. The max
          height keeps the dialog within the viewport so the Modal body never
          scrolls and the mobile keyboard (dvh) shrinks it cleanly. */}
      <Stack gap="sm" style={{ maxHeight: "min(72dvh, 680px)" }}>
        <Group gap="xs" wrap="nowrap" align="center" style={{ flexShrink: 0 }}>
          <form style={{ flex: 1, minWidth: 0 }} onSubmit={handleSubmit}>
            <Group gap="xs" wrap="nowrap" align="center">
              <TextInput
                aria-label="Search events"
                placeholder="Search events by title, location, or type"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                enterKeyHint="search"
                style={{ flex: 1, minWidth: 0 }}
                rightSection={
                  query ? (
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size="sm"
                      aria-label="Clear search"
                      onClick={() => setQuery("")}
                    >
                      <IconX size={14} />
                    </ActionIcon>
                  ) : null
                }
              />
              {/* Desktop keeps the labelled button; phones use a 43px icon so
                  the input, submit and date filter stay on one row. */}
              <Button
                type="submit"
                visibleFrom="lg"
                loading={loading}
                loaderProps={BUTTON_LOADER_PROPS}
                leftSection={<IconSearch size={16} />}
              >
                Search
              </Button>
              <ActionIcon
                type="submit"
                hiddenFrom="lg"
                size={43}
                variant="filled"
                aria-label="Search"
                loading={loading}
                loaderProps={BUTTON_LOADER_PROPS}
              >
                <IconSearch size={18} />
              </ActionIcon>
            </Group>
          </form>
          <Menu
            shadow="md"
            width={300}
            position="bottom-end"
            closeOnClickOutside={false}
            transitionProps={{
              transition: "pop-top-right",
              duration: MOTION.popover,
              timingFunction: "ease",
            }}
          >
            <Menu.Target>
              <Box pos="relative">
                <ActionIcon
                  size={43}
                  variant="default"
                  aria-label="Search date range"
                  style={{ flexShrink: 0 }}
                >
                  <IconCalendar size={18} />
                </ActionIcon>
                {rangeChanges > 0 && (
                  <Badge
                    size="sm"
                    variant="filled"
                    radius="xl"
                    pos="absolute"
                    style={{ top: -4, right: -4 }}
                  >
                    {rangeChanges}
                  </Badge>
                )}
              </Box>
            </Menu.Target>
            <Menu.Dropdown>
              <Stack gap="sm" p="xs">
                <Group grow align="flex-end" wrap="wrap">
                  <DatePickerInput
                    label="From"
                    value={from}
                    valueFormat="YYYY-MM-DD"
                    onChange={setFrom}
                    clearable
                  />
                  <DatePickerInput
                    label="To"
                    value={to}
                    valueFormat="YYYY-MM-DD"
                    onChange={setTo}
                    clearable
                  />
                </Group>
                <Button
                  variant="subtle"
                  size="xs"
                  disabled={rangeChanges === 0}
                  onClick={() => {
                    setFrom(defaultFrom);
                    setTo(defaultTo);
                  }}
                >
                  Reset to default range
                </Button>
              </Stack>
            </Menu.Dropdown>
          </Menu>
        </Group>

        {showRecent && (
          <Stack gap={4} style={{ flexShrink: 0 }}>
            <Text size="xs" c="dimmed" fw={500}>
              Recent searches
            </Text>
            <div className="c2-chip-scroll">
              {history?.map((term) => (
                <Group key={term} gap={0} wrap="nowrap">
                  <Badge
                    component="button"
                    type="button"
                    variant="light"
                    color="brand"
                    onClick={() => {
                      setQuery(term);
                      void runSearch(term);
                    }}
                    styles={{ root: { cursor: "pointer", textTransform: "none" } }}
                  >
                    {term}
                  </Badge>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="gray"
                    aria-label={`Remove "${term}" from recent searches`}
                    onClick={() => {
                      setHistory((prev) => removeSearchHistoryEntry(prev ?? [], term));
                      void removeSearchHistory(term);
                    }}
                  >
                    <IconX size={12} />
                  </ActionIcon>
                </Group>
              ))}
            </div>
          </Stack>
        )}

        {error && (
          <Text size="sm" c="red" style={{ flexShrink: 0 }}>
            {error}
          </Text>
        )}

        {!loading && results !== null && results.length > 0 && (
          <Group justify="space-between" gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
            <Text
              size="xs"
              c="dimmed"
              style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {results.length} result{results.length === 1 ? "" : "s"}
              {rangeLabel ? ` · ${rangeLabel}` : ""}
            </Text>
            <Button
              variant="subtle"
              size="compact-xs"
              onClick={() => {
                setQuery("");
                setResults(null);
                setMyEventIds([]);
                setSearchedRange(null);
                setError(null);
              }}
            >
              Clear
            </Button>
          </Group>
        )}

        {loading && (
          <Box style={{ border: LIST_BORDER, borderRadius: "var(--mantine-radius-md)", overflow: "hidden" }}>
            <LoadingStatus label="Searching events" />
            <Stack gap={0}>
              {Array.from({ length: 4 }).map((_, i) => (
                <Group
                  key={i}
                  gap="sm"
                  wrap="nowrap"
                  align="center"
                  style={{
                    padding: "var(--mantine-spacing-sm)",
                    borderTop: i === 0 ? undefined : LIST_BORDER,
                  }}
                >
                  <Skeleton width={4} height={28} radius={2} style={{ flexShrink: 0 }} />
                  <Box style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                    <Skeleton height={13} radius={2} style={{ width: `${60 - (i % 3) * 12}%` }} />
                    <Skeleton height={10} radius={2} style={{ width: "32%" }} />
                  </Box>
                </Group>
              ))}
            </Stack>
          </Box>
        )}

        {!loading && results !== null && results.length === 0 && (
          <EmptyState
            icon={<IconSearchOff size={18} />}
            description={
              query.trim()
                ? `No events match “${query.trim()}”. Try another term or widen the date range.`
                : "No events match your search."
            }
          />
        )}

        {!loading && results !== null && results.length > 0 && (
          <Box
            ref={listRef}
            style={{
              position: "relative",
              border: LIST_BORDER,
              borderRadius: "var(--mantine-radius-md)",
              overflow: "hidden",
              overflowY: "auto",
              flex: "1 1 auto",
              minHeight: 0,
            }}
          >
            <Stack gap={0}>
              {visibleResults?.map((event, index) => {
                const mine = myIdSet.has(event.id);
                const external = event.payload.external === true;
                return (
                  <UnstyledButton
                    key={`${event.id}:${index}`}
                    onClick={(e) => handleEventClick(event, e)}
                    className={[mine && "c2-my-agenda-event", external && "c2-ext-agenda-event"]
                      .filter(Boolean)
                      .join(" ")}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "var(--mantine-spacing-sm)",
                      borderTop: index === 0 ? undefined : LIST_BORDER,
                    }}
                  >
                    <Group gap="sm" wrap="nowrap" align="center">
                      <Box
                        style={{
                          width: 4,
                          height: 30,
                          borderRadius: 2,
                          flexShrink: 0,
                          background: `var(--mantine-color-${event.color}-filled)`,
                        }}
                      />
                      <Box style={{ minWidth: 0, flex: 1 }}>
                        <Text component="p" size="sm" truncate>
                          {event.title}
                        </Text>
                        <Text size="xs" c="dimmed" truncate>
                          {eventWhenLabel(event)}
                          {event.payload.location ? ` · ${event.payload.location}` : ""}
                          {event.payload.calendarName ? ` · ${event.payload.calendarName}` : ""}
                        </Text>
                      </Box>
                    </Group>
                  </UnstyledButton>
                );
              })}
            </Stack>
            {results.length > visibleCount && (
              <Group justify="center" p="xs">
                <Button
                  variant="subtle"
                  size="xs"
                  onClick={() => setVisibleCount((count) => count + RESULT_PAGE_SIZE)}
                >
                  Show more ({results.length - visibleCount} remaining)
                </Button>
              </Group>
            )}
            {opened && opening && (
              <Box
                style={{
                  position: "absolute",
                  top: opening.top,
                  left: opening.left,
                  width: opening.width,
                  height: opening.height,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "var(--mantine-color-body)",
                  pointerEvents: "none",
                }}
              >
                <Loader size="sm" color="gray" />
                <LoadingStatus label="Opening event" />
              </Box>
            )}
          </Box>
        )}
      </Stack>
    </Modal>
  );
}
