"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  Box,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
  TextInput,
  useMantineTheme,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useMediaQuery } from "@mantine/hooks";
import { AgendaView } from "@mantine/schedule";
import { IconSearch } from "@tabler/icons-react";
import { NARROW_MEDIA_QUERY } from "@/lib/theme";

import { formatInstantToNaive } from "@/lib/events/datetime";
import type { CalendarEvent } from "@/lib/events/queries";
import { searchEvents } from "@/lib/events/search";
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
import { BUTTON_LOADER_PROPS } from "@/lib/theme";

import { LoadingStatus } from "./LoadingStatus";

interface EventSearchModalProps {
  opened: boolean;
  onClose: () => void;
  originRect: Rect | null;
}

export default function EventSearchModal({ opened, onClose, originRect }: EventSearchModalProps) {
  const router = useRouter();
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const isNarrow = useMediaQuery(NARROW_MEDIA_QUERY);
  const today = formatInstantToNaive(new Date()).slice(0, 10);

  const [query, setQuery] = useState("");
  const [from, setFrom] = useState<string | null>(defaultSearchFrom(today));
  const [to, setTo] = useState<string | null>(defaultSearchTo(today));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CalendarEvent[] | null>(null);

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

  // The shell lazy-mounts this modal on its very first open, so the Modal's
  // Mantine Transition would initialize to "entered" and the zoom-in from the
  // header button would never play. Mirror the `opened` prop into a local
  // `mounted` state so the Transition always has an "exited" start state.
  // The open flip is deferred by one animation frame: flipped synchronously in
  // the effect, the browser coalesces the enter rAFs into a single paint and
  // the zoom still never plays. Closing flips immediately so the shrink-out
  // doesn't lag; later opens take the same deferred path.
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
      setError(null);
      setOpening(null);
    }
  }

  // The modal zooms out of / shrinks back into the header search button (the
  // app's standard grow/shrink animation; mirror PinnedEventsPanel).
  const viewport = {
    w: typeof window === "undefined" ? 0 : window.innerWidth,
    h: typeof window === "undefined" ? 0 : window.innerHeight,
  };
  const contentWidth = modalContentWidth(viewport, isNarrow ? 380 : isDesktop ? 620 : 440);
  const transitionProps = {
    transition: {
      in: { opacity: 1, transform: "scale(1)" },
      out: { opacity: 0, transform: `scale(${scaleFromRect(originRect, contentWidth)})` },
      common: { transformOrigin: transformOriginFromRect(originRect, viewport, "center") },
      transitionProperty: "transform, opacity",
    },
    duration: 240,
    exitDuration: 200,
    timingFunction: "cubic-bezier(0.3, 1.2, 0.4, 1)",
  } as const;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < SEARCH_MIN_QUERY_LENGTH) {
      setError(`Enter at least ${SEARCH_MIN_QUERY_LENGTH} characters to search`);
      return;
    }
    if (loading) {
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await searchEvents(trimmed, from ?? "", to ?? "");
      if (result.ok) {
        setResults(result.events);
      } else {
        setError(result.error);
      }
    } catch {
      setError("Search failed, please try again");
    } finally {
      setLoading(false);
    }
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
    const params = new URLSearchParams({ date: calendarEvent.start.slice(0, 10) });
    if (calendarEvent.payload.eventId) {
      params.set("event", calendarEvent.payload.eventId);
      // The search covers every calendar, but the dashboard resolves the
      // remembered view/filters and the event may live on a calendar the
      // current selection excludes. Pass the event's calendar so page.tsx can
      // include it in the fetch regardless of the filter set — otherwise the
      // event can't be found and won't open.
      params.set("_eventCal", calendarEvent.payload.calendarId);
    }
    startTransition(() => {
      router.push(`/dashboard?${params.toString()}`);
    });
  }

  const rangeStart = results && results.length > 0 ? results[0].start.slice(0, 10) : (from ?? "");
  const rangeEnd =
    results && results.length > 0 ? results[results.length - 1].start.slice(0, 10) : (to ?? "");

  return (
    <Modal
      opened={mounted}
      onClose={onClose}
      title="Search events"
      centered
      size={isNarrow ? "sm" : isDesktop ? "lg" : "md"}
      transitionProps={transitionProps}
    >
      <Stack>
        <form onSubmit={handleSubmit}>
          <TextInput
            label="Search"
            placeholder="Search event titles and locations"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            leftSection={<IconSearch size={14} style={{ color: "var(--mantine-color-dimmed)" }} />}
            autoFocus
          />
          <Group mt="xs" grow>
            <DatePickerInput label="From" value={from} valueFormat="YYYY-MM-DD" clearable onChange={setFrom} />
            <DatePickerInput label="To" value={to} valueFormat="YYYY-MM-DD" clearable onChange={setTo} />
          </Group>
          <Button
            type="submit"
            mt="md"
            fullWidth
            leftSection={<IconSearch size={16} />}
            loading={loading}
            loaderProps={BUTTON_LOADER_PROPS}
          >
            Search
          </Button>
        </form>

        {error && (
          <Text size="sm" c="red">
            {error}
          </Text>
        )}

        {results !== null &&
          (results.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py="lg">
              No events match your search.
            </Text>
          ) : (
            <Box
              ref={listRef}
              style={{
                position: "relative",
                border: "1px solid var(--mantine-color-default-border)",
                borderRadius: "var(--mantine-radius-md)",
                overflow: "hidden",
                maxHeight: "calc(100vh - 320px)",
                overflowY: "auto",
              }}
            >
              <AgendaView
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                events={results}
                styles={{ agendaViewHeader: { display: "none" } }}
                onEventClick={handleEventClick}
              />
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
          ))}
      </Stack>
    </Modal>
  );
}
