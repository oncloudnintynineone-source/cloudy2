"use client";

import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Group,
  Modal,
  Paper,
  Stack,
  Tabs,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure, useDrag } from "@mantine/hooks";
import { AgendaView, MobileMonthView, MonthView, ResourcesDayView } from "@mantine/schedule";
import {
  IconBuilding,
  IconCalendarDot,
  IconCalendarMonth,
  IconCalendarUser,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconUser,
} from "@tabler/icons-react";

import {
  MobileGridSkeleton,
  MonthGridSkeleton,
  ScheduleGridSkeleton,
  monthGridRows,
} from "./calendarSkeleton";
import { FilterButton } from "@/components/FilterButton";
import { FilterModal, type FilterGroup } from "@/components/FilterModal";
import { FloatingToolbar } from "@/components/FloatingToolbar";
import type { CalendarEvent } from "@/lib/events/queries";
import type { TimeOption } from "@/lib/events/timeOptions";
import {
  buildScheduleResources,
  expandScheduleEvents,
  isDepartmentRowId,
  type ScheduleResource,
  type ScheduleUser,
} from "@/lib/events/schedule";
import { EventDetail } from "./EventDetail";
import { EventForm } from "./EventForm";

type ViewMode = "month" | "mobile" | "schedule";

interface EventTypeOption {
  name: string;
  shortname: string | null;
  timeOptions: TimeOption[];
}

interface DashboardViewProps {
  month: string;
  date: string;
  view: ViewMode;
  events: CalendarEvent[];
  calendars: { id: string; name: string }[];
  eventTypes: EventTypeOption[];
  eventTitleTemplate: string;
  googleConfigured: boolean;
  selectedCalendarIds: string[];
  selectedTypes: string[];
  selectedUserIds: string[];
  currentUser: string;
  /** Admin may create/edit events on behalf of any user. */
  isAdmin: boolean;
  /**
   * Event group id from the `?edit=` deep link (a Google Calendar "Edit:"
   * note); its edit form opens automatically once the events are loaded.
   */
  initialEditEventId: string | null;
  scheduleUsers: ScheduleUser[];
  inviteeDepartments: { id: string; name: string }[];
  inviteeUsers: {
    id: string;
    name: string;
    shortname: string | null;
    departmentName: string | null;
    displayName: string;
  }[];
  peopleNames: Record<string, string>;
  calendarNames: Record<string, string>;
}

interface FormState {
  event: CalendarEvent | null;
  defaultDate: string;
}

const DAY_SWIPE_THRESHOLD = 48;

export function DashboardView({
  month,
  date,
  view,
  events,
  calendars,
  eventTypes,
  eventTitleTemplate,
  googleConfigured,
  selectedCalendarIds,
  selectedTypes,
  selectedUserIds,
  currentUser,
  isAdmin,
  initialEditEventId,
  scheduleUsers,
  inviteeDepartments,
  inviteeUsers,
  peopleNames,
  calendarNames,
}: DashboardViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [targetView, setTargetView] = useState<ViewMode>(view);

  // The `?edit=` deep link (from a Google Calendar "Edit:" note) resolves its
  // target event synchronously at mount — the server has already fetched the
  // month — so the edit form/banner initialize without a follow-up render.
  const initialEditEvent = initialEditEventId
    ? (events.find((event) => event.payload.eventId === initialEditEventId) ?? null)
    : null;

  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
  const [formState, setFormState] = useState<FormState | null>(() =>
    initialEditEvent
      ? { event: initialEditEvent, defaultDate: initialEditEvent.start.slice(0, 10) }
      : null,
  );
  const [agendaDate, setAgendaDate] = useState<string | null>(null);
  const [editLinkFailed, setEditLinkFailed] = useState(
    () => initialEditEventId !== null && initialEditEvent === null,
  );
  const [filterOpened, { open: openFilter, close: closeFilter }] = useDisclosure(false);

  const monthLabel = dayjs(`${month}-01`).format("MMMM YYYY");
  const dayLabel = dayjs(date).format("ddd, MMM D, YYYY");
  const today = dayjs().format("YYYY-MM-DD");
  const todayMonth = dayjs().format("YYYY-MM");

  const filterGroups: FilterGroup[] = useMemo(() => {
    const groups: FilterGroup[] = [
      { label: "Calendars", options: calendars.map((c) => ({ value: c.id, label: c.name })) },
    ];
    const userOptions = inviteeUsers.map((user) => ({
      value: user.id,
      label: user.displayName,
    }));
    if (userOptions.length > 0) {
      groups.push({
        label: "Users",
        options: userOptions,
        // A searchable dropdown instead of one checkbox card per user — the
        // card grid gets unusably tall as the roster grows.
        variant: "search",
        action: inviteeUsers.some((user) => user.id === currentUser)
          ? {
              label: "Only me",
              icon: <IconUser size={14} />,
              isApplied: (selected) => selected.length === 1 && selected[0] === currentUser,
              apply: (setValues, { selected }) => {
                const isActive = selected.length === 1 && selected[0] === currentUser;
                // Search groups: empty selection means "no filter".
                setValues(isActive ? [] : [currentUser]);
              },
            }
          : undefined,
      });
    }
    if (eventTypes.length > 0) {
      groups.push({
        label: "Event Types",
        options: eventTypes.map((type) => ({ value: type.name, label: type.name })),
      });
    }
    return groups;
  }, [calendars, inviteeUsers, currentUser, eventTypes]);

  const filterValues: Record<string, string[]> = useMemo(
    () => ({
      Calendars: selectedCalendarIds,
      Users: selectedUserIds,
      "Event Types": selectedTypes,
    }),
    [selectedCalendarIds, selectedUserIds, selectedTypes],
  );

  const activeFilterCount =
    (selectedCalendarIds.length > 0 && selectedCalendarIds.length < calendars.length ? 1 : 0) +
    (selectedUserIds.length > 0 ? 1 : 0) +
    (selectedTypes.length > 0 ? 1 : 0);

  const scheduleDepartments = useMemo(
    () => calendars.filter((calendar) => selectedCalendarIds.includes(calendar.id)),
    [calendars, selectedCalendarIds],
  );
  const scheduleResources = useMemo(
    () =>
      buildScheduleResources({
        departments: scheduleDepartments,
        users: scheduleUsers,
        events,
      }),
    [scheduleDepartments, scheduleUsers, events],
  );
  const scheduleEvents = useMemo(() => expandScheduleEvents(events), [events]);

  const navigate = useCallback(
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
      startTransition(() => {
        router.push(query ? `${pathname}?${query}` : pathname);
      });
    },
    [searchParams, pathname, router, startTransition],
  );

  // Strip the one-shot `edit` param from the URL so a refresh doesn't reopen
  // the edit form.
  const editParamClearedRef = useRef(false);
  useEffect(() => {
    if (!initialEditEventId || editParamClearedRef.current) {
      return;
    }
    editParamClearedRef.current = true;
    navigate({ edit: null });
  }, [initialEditEventId, navigate]);

  function shiftMonth(delta: number) {
    setTargetView(view);
    const next = dayjs(`${month}-01`).add(delta, "month").format("YYYY-MM");
    navigate({ month: next });
  }

  function shiftDay(delta: number) {
    setTargetView(view);
    const next = dayjs(date).add(delta, "day");
    navigate({ date: next.format("YYYY-MM-DD"), month: next.format("YYYY-MM") });
  }

  function switchView(next: string) {
    const mode: ViewMode = next === "schedule" ? "schedule" : next === "mobile" ? "mobile" : "month";
    setTargetView(mode);
    if (mode === "schedule") {
      // Entering the schedule always starts on today; the month is derived
      // from the date by the page.
      navigate({ view: "schedule", month: null, date: today });
      return;
    }
    // Leaving the schedule keeps the currently viewed month visible.
    navigate({
      view: mode === "month" ? null : mode,
      month: view === "schedule" ? date.slice(0, 7) : null,
      date: null,
    });
  }

  function goToday() {
    setTargetView(view);
    if (view === "schedule") {
      navigate({ date: today, month: todayMonth });
    } else {
      navigate({ month: todayMonth });
    }
  }

  function shiftAgendaDay(delta: number) {
    if (agendaDate === null) return;
    const next = dayjs(agendaDate).add(delta, "day");
    setAgendaDate(next.format("YYYY-MM-DD"));
    const nextMonth = next.format("YYYY-MM");
    if (nextMonth !== month) {
      navigate({ month: nextMonth });
    }
  }

  const swipedRef = useRef(false);
  const { ref: agendaSwipeRef } = useDrag<HTMLDivElement>(
    (state) => {
      if (!state.last || state.canceled || state.tap) return;
      if (Math.abs(state.movement[0]) < DAY_SWIPE_THRESHOLD) return;
      swipedRef.current = true;
      shiftAgendaDay(state.movement[0] < 0 ? 1 : -1);
    },
    { axis: "lock", axisThreshold: 8, threshold: 10, filterTaps: true },
  );

  function handleApplyFilters(values: Record<string, string[]>) {
    setTargetView(view);
    const cals = values.Calendars ?? [];
    const users = values.Users ?? [];
    const types = values["Event Types"] ?? [];
    navigate({
      cal: cals.length > 0 ? cals.join(",") : null,
      users: users.length > 0 ? users.join(",") : null,
      types: types.length > 0 ? types.join(",") : null,
    });
  }

  function openCreate(dateValue: string) {
    setFormState({ event: null, defaultDate: dateValue });
  }

  function closeForm() {
    setFormState(null);
  }

  const isSchedule = view === "schedule";

  return (
    <Stack pb="xl" gap="sm">
      <Tabs
        value={view}
        onChange={(next) => switchView(next ?? "month")}
        aria-label="Calendar view"
        styles={{ tab: { flex: 1 } }}
      >
        <Tabs.List>
          <Tabs.Tab value="month">
            <Group gap="xs" justify="center" wrap="nowrap">
              <IconCalendarMonth size={16} />
              <Text fw={600} size="sm">Month</Text>
            </Group>
          </Tabs.Tab>
          <Tabs.Tab value="mobile">
            <Group gap="xs" justify="center" wrap="nowrap">
              <IconCalendarDot size={16} />
              <Text fw={600} size="sm">S. Month</Text>
            </Group>
          </Tabs.Tab>
          <Tabs.Tab value="schedule">
            <Group gap="xs" justify="center" wrap="nowrap">
              <IconCalendarUser size={16} />
              <Text fw={600} size="sm">Day</Text>
            </Group>
          </Tabs.Tab>
        </Tabs.List>
      </Tabs>

      <Group justify="space-between" align="center">
        <Group gap="xs">
          <ActionIcon
            variant="default"
            aria-label={isSchedule ? "Previous day" : "Previous month"}
            onClick={() => (isSchedule ? shiftDay(-1) : shiftMonth(-1))}
          >
            <IconChevronLeft size={18} />
          </ActionIcon>
          <Text fw={600} size="lg">
            {isSchedule ? dayLabel : monthLabel}
          </Text>
          <ActionIcon
            variant="default"
            aria-label={isSchedule ? "Next day" : "Next month"}
            onClick={() => (isSchedule ? shiftDay(1) : shiftMonth(1))}
          >
            <IconChevronRight size={18} />
          </ActionIcon>
        </Group>
        <Group gap="xs">
          <Button variant="subtle" size="xs" color="accent" onClick={goToday}>
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

      {editLinkFailed && (
        <Alert
          color="yellow"
          title="Could not open that event"
          withCloseButton
          onClose={() => setEditLinkFailed(false)}
        >
          It is not in your current view — adjust the calendar filters or check the date of the
          event.
        </Alert>
      )}

      {isPending ? (
        targetView === "month" ? (
          <MonthGridSkeleton rows={monthGridRows(month)} />
        ) : targetView === "schedule" ? (
          <ScheduleGridSkeleton />
        ) : (
          <MobileGridSkeleton rows={monthGridRows(month)} />
        )
      ) : view === "month" ? (
        <MonthView
          date={`${month}-01 00:00:00`}
          events={events}
          withHeader={false}
          maxEventsPerDay={3}
          onEventClick={(event) => setDetailEvent(event as unknown as CalendarEvent)}
          onDayClick={(d) => setAgendaDate(d)}
        />
      ) : view === "mobile" ? (
        <MobileMonthView
          date={`${month}-01 00:00:00`}
          events={events}
          styles={{
            mobileMonthViewHeader: { display: "none" },
            mobileMonthViewEventsList: { display: "none" },
          }}
          onDayClick={(day) => setAgendaDate(day)}
        />
      ) : scheduleResources.resources.length === 0 ? (
        <Paper withBorder radius="md" p="lg">
          <Text size="sm" c="dimmed">
            No users in the selected calendars yet. Assign users to a department (Admin Settings)
            or adjust the filters.
          </Text>
        </Paper>
      ) : (
        <ResourcesDayView
          date={date}
          resources={scheduleResources.resources}
          groups={scheduleResources.groups}
          events={scheduleEvents}
          startTime="00:00:00"
          endTime="23:59:59"
          intervalMinutes={60}
          startScrollTime="07:00:00"
          rowHeight={56}
          withHeader={false}
          withCurrentTimeIndicator
          onEventClick={(event) => setDetailEvent(event as unknown as CalendarEvent)}
          vars={() => ({
            resourcesDayView: {
              "--resources-day-view-resource-label-width": "3rem",
              "--resources-day-view-group-label-width": "1.5rem",
            },
          })}
          styles={{
            resourcesDayViewResourceLabel: {
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              paddingInline: 0,
            },
          }}
          labels={{ resources: "" }}
          // All-day events render as full-width bars whose label would scroll
          // out of view; the renderEvent hook re-renders only those and pins the
          // title with position: sticky beside the sticky resource column.
          renderEvent={(event, rootProps) => {
            const isAllDay = Boolean((event as unknown as CalendarEvent).payload.allDay);
            if (!isAllDay) {
              return <UnstyledButton {...rootProps} />;
            }
            const stickyLeft =
              scheduleResources.groups !== undefined
                ? "calc(var(--resources-day-view-group-label-width) + var(--resources-day-view-resource-label-width) + 4px)"
                : "calc(var(--resources-day-view-resource-label-width) + 4px)";
            return (
              <UnstyledButton {...rootProps}>
                <Box
                  style={{
                    display: "flex",
                    alignItems: "center",
                    width: "100%",
                    height: "100%",
                    paddingInline: "4px",
                    backgroundColor: "var(--event-bg)",
                    color: "var(--event-color)",
                    borderRadius: "min(var(--event-radius), 50%)",
                    pointerEvents: "all",
                    userSelect: "none",
                  }}
                >
                  <span
                    style={{
                      position: "sticky",
                      left: stickyLeft,
                      minWidth: 0,
                      maxWidth: "min(70vw, 100%)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontSize: "calc(0.75rem * var(--mantine-scale))",
                      fontWeight: "var(--mantine-font-weight-medium)",
                      lineHeight: 1,
                    }}
                  >
                    {event.title}
                  </span>
                </Box>
              </UnstyledButton>
            );
          }}
          renderResourceLabel={(resource) => {
            const row = resource as ScheduleResource;
            return isDepartmentRowId(row.id) ? (
              <IconBuilding
                size={16}
                color="var(--mantine-color-accent-6)"
                aria-label={row.fullName}
                title={row.fullName}
                style={{ flexShrink: 0 }}
              />
            ) : (
              <Text size="sm" title={row.label === row.fullName ? undefined : row.fullName}>
                {row.label}
              </Text>
            );
          }}
          renderGroupLabel={(group) => (
            <span style={{ writingMode: "vertical-rl" }}>{group.label}</span>
          )}
        />
      )}

      <Modal
        opened={agendaDate !== null}
        onClose={() => setAgendaDate(null)}
        title={
          agendaDate ? (
            <Group gap="xs" justify="center" w="100%">
              <ActionIcon
                variant="subtle"
                size="sm"
                aria-label="Previous day"
                onClick={() => shiftAgendaDay(-1)}
              >
                <IconChevronLeft size={16} />
              </ActionIcon>
              <Text fw={600} size="sm">
                {dayjs(agendaDate).format("dddd, MMMM D, YYYY")}
              </Text>
              <ActionIcon
                variant="subtle"
                size="sm"
                aria-label="Next day"
                onClick={() => shiftAgendaDay(1)}
              >
                <IconChevronRight size={16} />
              </ActionIcon>
            </Group>
          ) : (
            ""
          )
        }
        centered
        size="sm"
      >
        {agendaDate && (
          <div
            ref={agendaSwipeRef}
            style={{ touchAction: "pan-y" }}
            onClickCapture={(event) => {
              if (swipedRef.current) {
                event.preventDefault();
                event.stopPropagation();
                swipedRef.current = false;
              }
            }}
          >
            <AgendaView
              rangeStart={agendaDate}
              rangeEnd={agendaDate}
              events={events}
              styles={{ agendaViewHeader: { display: "none" } }}
              onEventClick={(event) => setDetailEvent(event as unknown as CalendarEvent)}
            />
          </div>
        )}
      </Modal>

      <EventDetail
        event={detailEvent}
        onClose={() => setDetailEvent(null)}
        onEdit={(event) => {
          setDetailEvent(null);
          setFormState({ event, defaultDate: today });
        }}
        onDeleted={() => {
          setDetailEvent(null);
          setAgendaDate(null);
          router.refresh();
        }}
        peopleNames={peopleNames}
        calendarNames={calendarNames}
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
            eventTypes={eventTypes}
            eventTitleTemplate={eventTitleTemplate}
            currentUser={currentUser}
            isAdmin={isAdmin}
            inviteeDepartments={inviteeDepartments}
            inviteeUsers={inviteeUsers}
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
