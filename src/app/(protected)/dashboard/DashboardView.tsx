"use client";

import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ActionIcon, Alert, Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { MonthView } from "@mantine/schedule";
import { IconChevronLeft, IconChevronRight, IconPlus } from "@tabler/icons-react";

import { FilterButton } from "@/components/FilterButton";
import { FilterModal, type FilterGroup } from "@/components/FilterModal";
import { FloatingToolbar } from "@/components/FloatingToolbar";
import type { CalendarEvent } from "@/lib/events/queries";
import { EventDetail } from "./EventDetail";
import { EventForm } from "./EventForm";

interface DashboardViewProps {
  month: string;
  events: CalendarEvent[];
  calendars: { id: string; name: string }[];
  eventTypes: string[];
  isAdmin: boolean;
  googleConfigured: boolean;
  selectedCalendarIds: string[];
  selectedTypes: string[];
  initialCalendarId: string;
}

interface FormState {
  event: CalendarEvent | null;
  defaultDate: string;
}

export function DashboardView({
  month,
  events,
  calendars,
  eventTypes,
  isAdmin,
  googleConfigured,
  selectedCalendarIds,
  selectedTypes,
  initialCalendarId,
}: DashboardViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
  const [formState, setFormState] = useState<FormState | null>(null);
  const [filterOpened, { open: openFilter, close: closeFilter }] = useDisclosure(false);

  const monthLabel = dayjs(`${month}-01`).format("MMMM YYYY");
  const today = dayjs().format("YYYY-MM-DD");

  const filterGroups: FilterGroup[] = useMemo(() => {
    const groups: FilterGroup[] = [
      { label: "Calendars", options: calendars.map((c) => ({ value: c.id, label: c.name })) },
    ];
    if (eventTypes.length > 0) {
      groups.push({
        label: "Event Types",
        options: eventTypes.map((name) => ({ value: name, label: name })),
      });
    }
    return groups;
  }, [calendars, eventTypes]);

  const filterValues: Record<string, string[]> = useMemo(
    () => ({ Calendars: selectedCalendarIds, "Event Types": selectedTypes }),
    [selectedCalendarIds, selectedTypes],
  );

  const activeFilterCount =
    (selectedCalendarIds.length > 0 && selectedCalendarIds.length < calendars.length ? 1 : 0) +
    (selectedTypes.length > 0 ? 1 : 0);

  function navigate(updates: Record<string, string | null>) {
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
  }

  function shiftMonth(delta: number) {
    const next = dayjs(`${month}-01`).add(delta, "month").format("YYYY-MM");
    navigate({ month: next });
  }

  function goToday() {
    navigate({ month: dayjs().format("YYYY-MM") });
  }

  function handleApplyFilters(values: Record<string, string[]>) {
    const cals = values.Calendars ?? [];
    const types = values["Event Types"] ?? [];
    navigate({
      cal: cals.length > 0 ? cals.join(",") : null,
      types: types.length > 0 ? types.join(",") : null,
    });
  }

  function openCreate(date: string) {
    setFormState({ event: null, defaultDate: date });
  }

  function closeForm() {
    setFormState(null);
  }

  return (
    <Stack pb="xl">
      <Group justify="space-between" align="center">
        <Group gap="xs">
          <ActionIcon variant="default" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
            <IconChevronLeft size={18} />
          </ActionIcon>
          <Text fw={600} size="lg">
            {monthLabel}
          </Text>
          <ActionIcon variant="default" aria-label="Next month" onClick={() => shiftMonth(1)}>
            <IconChevronRight size={18} />
          </ActionIcon>
        </Group>
        <Group gap="xs">
          <Button variant="subtle" size="xs" onClick={goToday}>
            Today
          </Button>
          <FilterButton activeCount={activeFilterCount} onClick={openFilter} />
        </Group>
      </Group>

      {!googleConfigured && (
        <Alert color="yellow" title="Google Calendar is not configured">
          Events cannot be created or edited until Google service-account credentials are set.
        </Alert>
      )}

      <MonthView
        date={`${month}-01 00:00:00`}
        events={events}
        withHeader={false}
        maxEventsPerDay={3}
        onEventClick={(event) => setDetailEvent(event as unknown as CalendarEvent)}
        onDayClick={(date) => openCreate(date)}
      />

      <EventDetail
        event={detailEvent}
        onClose={() => setDetailEvent(null)}
        onEdit={(event) => {
          setDetailEvent(null);
          setFormState({ event, defaultDate: today });
        }}
        onDeleted={() => {
          setDetailEvent(null);
          router.refresh();
        }}
      />

      <Modal
        opened={formState !== null}
        onClose={closeForm}
        title={formState?.event ? "Edit event" : "New event"}
        centered
        size="sm"
      >
        {formState && (
          <EventForm
            key={formState.event ? formState.event.id : `new-${formState.defaultDate}`}
            event={formState.event}
            defaultDate={formState.defaultDate}
            calendars={calendars}
            eventTypes={eventTypes}
            isAdmin={isAdmin}
            initialCalendarId={initialCalendarId}
            onDone={() => {
              closeForm();
              router.refresh();
            }}
          />
        )}
      </Modal>

      <FilterModal
        opened={filterOpened}
        onClose={closeFilter}
        title="Filters"
        groups={filterGroups}
        values={filterValues}
        onApply={handleApplyFilters}
      />

      <FloatingToolbar>
        <Button
          radius="xl"
          leftSection={<IconPlus size={18} />}
          style={{ boxShadow: "var(--mantine-shadow-md)" }}
          onClick={() => openCreate(today)}
          disabled={!googleConfigured}
        >
          New event
        </Button>
      </FloatingToolbar>
    </Stack>
  );
}
