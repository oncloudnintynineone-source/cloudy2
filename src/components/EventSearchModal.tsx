"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Box, Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
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
import { BUTTON_LOADER_PROPS } from "@/lib/theme";

interface EventSearchModalProps {
  opened: boolean;
  onClose: () => void;
}

export default function EventSearchModal({ opened, onClose }: EventSearchModalProps) {
  const router = useRouter();
  const today = formatInstantToNaive(new Date()).slice(0, 10);

  const [query, setQuery] = useState("");
  const [from, setFrom] = useState<string | null>(defaultSearchFrom(today));
  const [to, setTo] = useState<string | null>(defaultSearchTo(today));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CalendarEvent[] | null>(null);

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

  function handleEventClick(event: unknown) {
    const calendarEvent = event as CalendarEvent;
    const params = new URLSearchParams({ date: calendarEvent.start.slice(0, 10) });
    if (calendarEvent.payload.eventId) {
      params.set("event", calendarEvent.payload.eventId);
    }
    onClose();
    router.push(`/dashboard?${params.toString()}`);
  }

  const rangeStart = results && results.length > 0 ? results[0].start.slice(0, 10) : (from ?? "");
  const rangeEnd =
    results && results.length > 0 ? results[results.length - 1].start.slice(0, 10) : (to ?? "");

  return (
    <Modal opened={opened} onClose={onClose} title="Search events" centered size="lg">
      <Stack>
        <form onSubmit={handleSubmit}>
          <TextInput
            label="Search"
            placeholder="Search event titles and locations"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            leftSection={
              <IconSearch size={14} style={{ color: "var(--mantine-color-dimmed)" }} />
            }
            autoFocus
          />
          <Group mt="xs" grow>
            <DatePickerInput
              label="From"
              value={from}
              valueFormat="YYYY-MM-DD"
              clearable
              onChange={setFrom}
            />
            <DatePickerInput
              label="To"
              value={to}
              valueFormat="YYYY-MM-DD"
              clearable
              onChange={setTo}
            />
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
                onEventClick={handleEventClick}
              />
            </Box>
          ))}
      </Stack>
    </Modal>
  );
}
