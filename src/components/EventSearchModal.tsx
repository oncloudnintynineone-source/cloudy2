"use client";

import { useRouter } from "next/navigation";
import {
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
  useEffect,
  useState,
  useTransition,
} from "react";
import {
  Box,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
  useMantineTheme,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useMediaQuery } from "@mantine/hooks";
import { AgendaView } from "@mantine/schedule";
import { IconSearch } from "@tabler/icons-react";

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

interface EventSearchModalProps {
  opened: boolean;
  onClose: () => void;
  originRect: Rect | null;
}

export default function EventSearchModal({ opened, onClose, originRect }: EventSearchModalProps) {
  const router = useRouter();
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const today = formatInstantToNaive(new Date()).slice(0, 10);

  const [query, setQuery] = useState("");
  const [from, setFrom] = useState<string | null>(defaultSearchFrom(today));
  const [to, setTo] = useState<string | null>(defaultSearchTo(today));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CalendarEvent[] | null>(null);

  // The result row whose deep-link navigation is in flight — it renders a
  // spinner in place of the agenda entry until the dashboard's event detail
  // modal is ready, then the search modal closes.
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isPending && openingId !== null) {
      // The navigation transition finished — clear the row spinner and close
      // the modal. `isPending` is React's external transition signal, so the
      // state write here is genuine effect synchronization.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpeningId(null);
      onClose();
    }
  }, [isPending, openingId, onClose]);

  // The modal zooms out of / shrinks back into the header search button (the
  // app's standard grow/shrink animation; mirror PinnedEventsPanel).
  const viewport = {
    w: typeof window === "undefined" ? 0 : window.innerWidth,
    h: typeof window === "undefined" ? 0 : window.innerHeight,
  };
  const contentWidth = modalContentWidth(viewport, isDesktop ? 620 : 440);
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
  // detail modal (Duplicate/Edit/Delete). The clicked row shows a spinner while
  // the navigation is in flight, then the search modal closes.
  function handleEventClick(event: unknown) {
    const calendarEvent = event as CalendarEvent;
    setOpeningId(String(calendarEvent.id));
    const params = new URLSearchParams({ date: calendarEvent.start.slice(0, 10) });
    if (calendarEvent.payload.eventId) {
      params.set("event", calendarEvent.payload.eventId);
    }
    startTransition(() => {
      router.push(`/dashboard?${params.toString()}`);
    });
  }

  function renderEvent(
    event: { id: string | number },
    props: ComponentPropsWithoutRef<"button"> & { children: ReactNode },
  ): ReactElement {
    if (openingId !== null && String(event.id) === openingId) {
      return (
        <UnstyledButton
          {...props}
          onClick={undefined}
          style={{
            ...props.style,
            display: "flex",
            justifyContent: "center",
            cursor: "default",
          }}
        >
          <Loader size="sm" color="gray" />
        </UnstyledButton>
      );
    }
    return <UnstyledButton {...props} />;
  }

  const rangeStart = results && results.length > 0 ? results[0].start.slice(0, 10) : (from ?? "");
  const rangeEnd =
    results && results.length > 0 ? results[results.length - 1].start.slice(0, 10) : (to ?? "");

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Search events"
      centered
      size={isDesktop ? "lg" : "md"}
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
              style={{
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
                renderEvent={renderEvent}
                onEventClick={handleEventClick}
              />
            </Box>
          ))}
      </Stack>
    </Modal>
  );
}
