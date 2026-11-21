"use client";

import "@mantine/dates/styles.css";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Menu,
  Skeleton,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { IconCalendar, IconSearch, IconSearchOff, IconX } from "@tabler/icons-react";
import dayjs from "dayjs";

import { buildEventDeepLink } from "@/lib/events/deepLink";
import { formatInstantToNaive } from "@/lib/events/datetime";
import type { CalendarEvent } from "@/lib/events/queries";
import { searchEvents } from "@/lib/events/search";
import {
  defaultSearchFrom,
  defaultSearchTo,
  SEARCH_MIN_QUERY_LENGTH,
} from "@/lib/events/searchRange";
import { CrossfadeSwap } from "@/components/CrossfadeSwap";
import { useMotion } from "@/components/MotionProvider";
import { MIN_SKELETON_HOLD_MS } from "@/lib/loading/minHoldLoading";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";

import { EmptyState } from "./EmptyState";
import { LoadingStatus } from "./LoadingStatus";
import { PickerChip } from "./PickerField";

interface EventSearchBodyProps {
  // The user's recent queries (`null` = not yet fetched), owned by the modal
  // chrome so it survives open/close cycles and is warm before the first open.
  history: string[] | null;
  onRecordSearch: (term: string) => void;
  onRemoveSearch: (term: string) => void;
  onClose: () => void;
}

const LIST_BORDER = "1px solid var(--mantine-color-default-border)";

/**
 * How many result rows to mount at once. A broad query across every calendar
 * can return hundreds of events, so the list is paged to keep the DOM (and the
 * initial paint on a low-end phone) bounded. "Show more" reveals the rest.
 */
const RESULT_PAGE_SIZE = 150;

/**
 * One height for every control in the toolbar row. The theme pins every Input
 * field to `--input-height-sm` = `calc(2.7rem * var(--mantine-scale))` ≈ 43px
 * (`src/lib/theme.ts`), so the submit button and the two icon buttons match it
 * instead of Mantine's 36px `Button` default, which sat visibly short between
 * the query input and the date-filter trigger.
 */
const TOOLBAR_CONTROL_SIZE = 43;

/**
 * Placeholder pill sizes for the recent-searches row while the history is still
 * loading — the chip height matches `--c2-chip-height` (the shared removable-chip
 * height `PickerChip` renders at) and the widths leave room for the ✕ now sitting
 * inside the chip, so real pills swap in without a layout shift.
 */
const RECENT_SKELETON_WIDTHS = [92, 116, 84];
const RECENT_SKELETON_HEIGHT = 36;

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

/**
 * The tier header inside the result list: a dimmed label plus the section's
 * **total** (not the visible count — the list is paged). It carries the section's
 * top border so the header row, not the first event row, separates the tiers.
 */
function SectionHeader({ label, total, first }: { label: string; total: number; first: boolean }) {
  return (
    <Box
      style={{
        padding: "calc(var(--mantine-spacing-xs) / 2) var(--mantine-spacing-sm)",
        borderTop: first ? undefined : LIST_BORDER,
        background: "var(--mantine-color-default-hover)",
      }}
    >
      <Text size="xs" fw={600} c="dimmed" truncate>
        {label} · {total}
      </Text>
    </Box>
  );
}

/**
 * One result row: colour stripe + title + a when/location/calendar line, riding
 * the dashboard agenda's amber (`mine`) / purple (external) highlight. Shared by
 * both tier sections so the row markup exists exactly once.
 */
function ResultRow({
  event,
  mine,
  external,
  firstInSection,
  onOpen,
}: {
  event: CalendarEvent;
  mine: boolean;
  external: boolean;
  firstInSection: boolean;
  onOpen: (event: CalendarEvent, e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <UnstyledButton
      onClick={(e) => onOpen(event, e)}
      className={[mine && "c2-my-agenda-event", external && "c2-ext-agenda-event"]
        .filter(Boolean)
        .join(" ")}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "var(--mantine-spacing-sm)",
        borderTop: firstInSection ? undefined : LIST_BORDER,
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
}

export default function EventSearchBody({
  history,
  onRecordSearch,
  onRemoveSearch,
  onClose,
}: EventSearchBodyProps) {
  const motion = useMotion();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
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
  // The term a completed search actually ran with — the "Contains …" section
  // header names it, so it must not follow later typing in the input.
  const [searchedTerm, setSearchedTerm] = useState("");
  // How many leading results contain the query verbatim (the rest are the
  // typo-tolerant Fuse hits). The split index between the two sections.
  const [exactCount, setExactCount] = useState(0);

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
        setSearchedTerm(trimmed);
        setExactCount(result.exactCount);
        // Remember the query server-side (fire-and-forget) and update the
        // badge list optimistically through the chrome.
        onRecordSearch(trimmed);
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
  function handleEventClick(event: CalendarEvent, e: React.MouseEvent<HTMLButtonElement>) {
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
      start: event.start,
      eventId: event.payload.eventId,
      calendarId: event.payload.calendarId,
    });
    startTransition(() => {
      router.push(href);
    });
  }

  const visibleResults = results ? results.slice(0, visibleCount) : null;
  // The two tiers, split at the boundary the server returned. The flat list
  // stays the paging cursor — "Show more" extends the literal section first,
  // then the approximate one — so the split is clamped to what is mounted.
  const visible = visibleResults ?? [];
  const split = Math.min(exactCount, visible.length);
  const exactVisible = visible.slice(0, split);
  const fuzzyVisible = visible.slice(split);
  const exactTotal = results ? Math.min(exactCount, results.length) : 0;
  const fuzzyTotal = results ? results.length - exactTotal : 0;

  // The user's own rows get the amber highlight, external (Google-made) rows
  // the purple one — the same classes the dashboard agenda uses.
  const myIdSet = useMemo(() => new Set(myEventIds), [myEventIds]);

  const rangeChanges =
    ((from || defaultFrom) !== defaultFrom ? 1 : 0) + ((to || defaultTo) !== defaultTo ? 1 : 0);
  // Recents only compete with results: they show while no search has run (or
  // it came up empty), and collapse as soon as results arrive.
  const idleState = results === null || results.length === 0;
  const rangeLabel = searchedRange
    ? `${dayjs(searchedRange.from).format("D MMM YYYY")} – ${dayjs(searchedRange.to).format("D MMM YYYY")}`
    : "";

  return (
    <Stack gap="sm" style={{ maxHeight: "min(72dvh, 680px)" }}>
      {/* One bounded column: a fixed one-row toolbar (input + Search + date
          filter), then the result list as the only scroll region. The max
          height keeps the dialog within the viewport so the Modal body never
          scrolls and the mobile keyboard (dvh) shrinks it cleanly. */}
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
            {/* Desktop keeps the labelled button; phones use an icon-only button
                so the input, submit and date filter stay on one row. All three
                controls share `TOOLBAR_CONTROL_SIZE` — the button overrides
                Mantine's 36px `sm` height so it doesn't sit short between the
                43px input and the date-filter trigger. */}
            <Button
              type="submit"
              visibleFrom="lg"
              loading={loading}
              loaderProps={BUTTON_LOADER_PROPS}
              leftSection={<IconSearch size={16} />}
              __vars={{ "--button-height": `${TOOLBAR_CONTROL_SIZE}px` }}
            >
              Search
            </Button>
            <ActionIcon
              type="submit"
              hiddenFrom="lg"
              size={TOOLBAR_CONTROL_SIZE}
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
            duration: motion.duration.popover,
            timingFunction: motion.easing.out,
          }}
        >
          <Menu.Target>
            <Box pos="relative">
              <ActionIcon
                size={TOOLBAR_CONTROL_SIZE}
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
              {/* Stacked, not side by side: `DatePickerInput` renders its value
                  as *button text* (`component="button"` + `multiline`), so two
                  half-width fields inside a 300px popover left ~60px for
                  "2026-11-21" (the clearable ✕ reserves 50px) and the date
                  wrapped onto a second line. Full width gives each field ~200px
                  of text room; `nowrap` keeps a value from ever re-wrapping the
                  field into two lines at any popover width. */}
              <Stack gap="xs">
                <DatePickerInput
                  label="From"
                  value={from}
                  valueFormat="YYYY-MM-DD"
                  onChange={setFrom}
                  clearable
                  styles={{ input: { whiteSpace: "nowrap" } }}
                />
                <DatePickerInput
                  label="To"
                  value={to}
                  valueFormat="YYYY-MM-DD"
                  onChange={setTo}
                  clearable
                  styles={{ input: { whiteSpace: "nowrap" } }}
                />
              </Stack>
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

      {idleState && (
        <Stack gap={4} style={{ flexShrink: 0 }}>
          <Text size="xs" c="dimmed" fw={500}>
            Recent searches
          </Text>
          <CrossfadeSwap
            loading={history === null}
            minHoldMs={MIN_SKELETON_HOLD_MS}
            mode="overlay"
            skeleton={
              <div className="c2-chip-scroll">
                <LoadingStatus label="Loading recent searches" />
                {RECENT_SKELETON_WIDTHS.map((width, index) => (
                  <Skeleton
                    key={index}
                    height={RECENT_SKELETON_HEIGHT}
                    width={width}
                    radius="xl"
                  />
                ))}
              </div>
            }
          >
            {history !== null && history.length > 0 ? (
              <div className="c2-chip-scroll">
                {history.map((term) => (
                  <PickerChip
                    key={term}
                    label={term}
                    color="brand"
                    // A query is free text: natural case, not the badge default.
                    tt="none"
                    onSelect={() => {
                      setQuery(term);
                      void runSearch(term);
                    }}
                    selectLabel={`Search "${term}"`}
                    onRemove={() => onRemoveSearch(term)}
                    removeLabel={`Remove "${term}" from recent searches`}
                  />
                ))}
              </div>
            ) : null}
          </CrossfadeSwap>
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
            style={{
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
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
              setSearchedTerm("");
              setExactCount(0);
              setError(null);
            }}
          >
            Clear
          </Button>
        </Group>
      )}

      {(loading || (results !== null && results.length > 0)) && (
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
          <CrossfadeSwap
            loading={loading}
            minHoldMs={MIN_SKELETON_HOLD_MS}
            fill
            skeleton={
              <>
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
                        <Skeleton
                          height={13}
                          radius={2}
                          style={{ width: `${60 - (i % 3) * 12}%` }}
                        />
                        <Skeleton height={10} radius={2} style={{ width: "32%" }} />
                      </Box>
                    </Group>
                  ))}
                </Stack>
              </>
            }
          >
            {results !== null && results.length > 0 ? (
              <>
                <Stack gap={0}>
                  {/* Two tiers, in the order the server returned them: events
                      whose fields literally contain the query, then the
                      typo-tolerant Fuse hits. A section (and its header) renders
                      only when it has rows, and the first row of a section drops
                      its own top border — the header carries the separation. */}
                  {exactVisible.length > 0 && (
                    <SectionHeader
                      label={searchedTerm ? `Contains “${searchedTerm}”` : "Contains the text"}
                      total={exactTotal}
                      first
                    />
                  )}
                  {exactVisible.map((event, index) => (
                    <ResultRow
                      key={`${event.id}:${index}`}
                      event={event}
                      mine={myIdSet.has(event.id)}
                      external={event.payload.external === true}
                      firstInSection={index === 0}
                      onOpen={handleEventClick}
                    />
                  ))}
                  {fuzzyVisible.length > 0 && (
                    <SectionHeader
                      label="Approximate matches"
                      total={fuzzyTotal}
                      first={exactVisible.length === 0}
                    />
                  )}
                  {fuzzyVisible.map((event, index) => (
                    <ResultRow
                      // Flat index keeps keys unique when one logical event
                      // repeats across several days of the window.
                      key={`${event.id}:${split + index}`}
                      event={event}
                      mine={myIdSet.has(event.id)}
                      external={event.payload.external === true}
                      firstInSection={index === 0}
                      onOpen={handleEventClick}
                    />
                  ))}
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
              </>
            ) : null}
          </CrossfadeSwap>
          {opening && (
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
    </Stack>
  );
}
