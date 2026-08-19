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
import { MiniCalendar } from "@mantine/dates";
import { useDisclosure, useDrag } from "@mantine/hooks";
import { AgendaView, MobileMonthView, MonthView, ResourcesDayView } from "@mantine/schedule";
import {
  IconBuilding,
  IconCalendarDot,
  IconCalendarMonth,
  IconCalendarUser,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconPlus,
  IconRefresh,
  IconUser,
  IconX,
} from "@tabler/icons-react";

import {
  MobileGridSkeleton,
  MonthGridSkeleton,
  ScheduleGridSkeleton,
  monthGridRows,
} from "./calendarSkeleton";
import { FilterButton } from "@/components/FilterButton";
import { FilterModal, type FilterGroup } from "@/components/FilterModal";
import { FloatingActionButton, FloatingToolbar } from "@/components/FloatingToolbar";
import type { CalendarEvent } from "@/lib/events/queries";
import type { TimeOption } from "@/lib/events/timeOptions";
import {
  scaleFromRect,
  smModalContentWidth,
  transformOriginFromRect,
  type Rect,
} from "@/lib/motion/origin";
import {
  buildScheduleResources,
  expandScheduleEvents,
  isDepartmentRowId,
  type ScheduleResource,
  type ScheduleUser,
} from "@/lib/events/schedule";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
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
  /** Filter dialog user options: users of the selected departments + self. */
  filterUsers: { id: string; displayName: string }[];
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
  filterUsers,
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
  // Where the tapped element sat on screen; the modal grows out of / shrinks
  // back into it (see src/lib/motion/origin.ts).
  const [detailOriginRect, setDetailOriginRect] = useState<Rect | null>(null);
  const [agendaOriginRect, setAgendaOriginRect] = useState<Rect | null>(null);
  const [formOriginRect, setFormOriginRect] = useState<Rect | null>(null);
  const [formState, setFormState] = useState<FormState | null>(() =>
    initialEditEvent
      ? { event: initialEditEvent, defaultDate: initialEditEvent.start.slice(0, 10) }
      : null,
  );
  // Facebook-bubble minimize: the form modal collapses into a floating pill
  // while `formMinimized` is true. The modal stays mounted (`keepMounted`) so
  // the draft survives; `draftTitle` feeds the pill label.
  const [formMinimized, setFormMinimized] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [agendaDate, setAgendaDate] = useState<string | null>(null);
  // Keep the last shown agenda date so the closing (shrink) animation still has
  // content while `opened` is already false.
  const [displayAgendaDate, setDisplayAgendaDate] = useState<string | null>(agendaDate);
  const [prevAgendaDate, setPrevAgendaDate] = useState<string | null>(agendaDate);
  if (agendaDate && agendaDate !== prevAgendaDate) {
    setPrevAgendaDate(agendaDate);
    setDisplayAgendaDate(agendaDate);
  }
  const [editLinkFailed, setEditLinkFailed] = useState(
    () => initialEditEventId !== null && initialEditEvent === null,
  );
  const [filterOpened, { open: openFilter, close: closeFilter }] = useDisclosure(false);

  // The date shown in the agenda day modal; persists through the exit
  // animation so the shrinking box still has content.
  const agendaViewDate = agendaDate ?? displayAgendaDate;

  const viewport = {
    w: typeof window === "undefined" ? 0 : window.innerWidth,
    h: typeof window === "undefined" ? 0 : window.innerHeight,
  };
  const contentWidth = smModalContentWidth(viewport);
  const agendaTransitionProps = {
    transition: {
      in: { opacity: 1, transform: "scale(1)" },
      out: { opacity: 0, transform: `scale(${scaleFromRect(agendaOriginRect, contentWidth)})` },
      common: { transformOrigin: transformOriginFromRect(agendaOriginRect, viewport, "center") },
      transitionProperty: "transform, opacity",
    },
    duration: 240,
    exitDuration: 200,
    timingFunction: "cubic-bezier(0.3, 1.2, 0.4, 1)",
  } as const;
  const formTransitionProps = {
    transition: {
      in: { opacity: 1, transform: "scale(1)" },
      out: { opacity: 0, transform: `scale(${scaleFromRect(formOriginRect, contentWidth, 0.5)})` },
      common: {
        transformOrigin: transformOriginFromRect(formOriginRect, viewport, "bottom right"),
      },
      transitionProperty: "transform, opacity",
    },
    duration: 250,
    timingFunction: "ease",
  } as const;

  const monthLabel = dayjs(`${month}-01`).format("MMMM YYYY");
  const dayLabel = dayjs(date).format("ddd, MMM D, YYYY");
  const today = dayjs().format("YYYY-MM-DD");
  const todayMonth = dayjs().format("YYYY-MM");

  const filterGroups: FilterGroup[] = useMemo(() => {
    const groups: FilterGroup[] = [
      { label: "Calendars", options: calendars.map((c) => ({ value: c.id, label: c.name })) },
    ];
    const userOptions = filterUsers.map((user) => ({
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
        action: filterUsers.some((user) => user.id === currentUser)
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
  }, [calendars, filterUsers, currentUser, eventTypes]);

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

  const buildHref = useCallback(
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
      return query ? `${pathname}?${query}` : pathname;
    },
    [searchParams, pathname],
  );

  const navigate = useCallback(
    (updates: Record<string, string | null>) => {
      startTransition(() => {
        router.push(buildHref(updates));
      });
    },
    [buildHref, router, startTransition],
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

  // Strip the one-shot `refresh` nonce as soon as the forced render has
  // mounted, so later month/day navigation doesn't keep force-refreshing.
  // Self-terminating (stripping removes the param), and re-arms on every new
  // nonce — a ref guard would leak a second nonce if refresh is clicked
  // before the first strip lands.
  useEffect(() => {
    if (searchParams.get("refresh") === null) {
      return;
    }
    navigate({ refresh: null });
  }, [searchParams, navigate]);

  // Force refresh: a transition of its own (the button's spinner) wrapping
  // router.push directly — the transition Next runs inside push stays pending
  // for the whole navigation, so `isRefreshing` covers the load. The server
  // renders that same request with `force: true`; the page skeleton (the
  // shared `isPending` ORed in below) shows for the same window.
  const [isRefreshing, startRefresh] = useTransition();
  function refreshNow() {
    startRefresh(() => {
      router.push(buildHref({ refresh: String(Date.now()) }));
    });
  }

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

  // Draggable minimized bubble: pointer-based so it works for both mouse and
  // touch. A tap (movement under the threshold) restores the form; a drag
  // repositions the pill, clamped to the viewport.
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

  function openCreate(dateValue: string, originRect: Rect | null = null) {
    setFormMinimized(false);
    setDraftTitle("");
    setFormOriginRect(originRect);
    setFormState({ event: null, defaultDate: dateValue });
  }

  function closeForm() {
    setFormMinimized(false);
    setDraftTitle("");
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
        <Tabs.List
          style={{
            position: "sticky",
            top: "var(--app-shell-header-offset)",
            zIndex: 10,
            background: "var(--mantine-color-body)",
            borderBottom: "1px solid var(--mantine-color-default-border)",
          }}
        >
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
          <Button variant="default" size="xs" color="black" h={43} onClick={goToday}>
            Today
          </Button>
          <FilterButton activeCount={activeFilterCount} onClick={openFilter} />
          <ActionIcon
            size={43}
            variant="default"
            aria-label="Force refresh from Google Calendar"
            disabled={!googleConfigured}
            loading={isRefreshing}
            loaderProps={BUTTON_LOADER_PROPS}
            onClick={refreshNow}
          >
            <IconRefresh size={16} />
          </ActionIcon>
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

      {isSchedule && (
        <MiniCalendar
          value={date}
          date={dayjs(date).subtract(Math.floor(7 / 2), "day").format("YYYY-MM-DD")}
          onChange={(next) => navigate({ date: next, month: next.slice(0, 7) })}
          numberOfDays={7}
          size="sm"
          previousControlProps={{ style: { display: "none" } }}
          nextControlProps={{ style: { display: "none" } }}
          styles={{
            root: { width: "100%", maxWidth: 420, marginInline: "auto" },
            days: { flex: 1 },
            day: { flex: 1 },
          }}
        />
      )}

      {isPending || isRefreshing ? (
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
          onEventClick={(event, e) => {
            setDetailOriginRect(e.currentTarget.getBoundingClientRect());
            setDetailEvent(event as unknown as CalendarEvent);
          }}
          onDayClick={(d, e) => {
            setAgendaOriginRect(e.currentTarget.getBoundingClientRect());
            setAgendaDate(d);
          }}
        />
      ) : view === "mobile" ? (
        <MobileMonthView
          date={`${month}-01 00:00:00`}
          events={events}
          styles={{
            mobileMonthViewHeader: { display: "none" },
            mobileMonthViewEventsList: { display: "none" },
          }}
          onDayClick={(d, e) => {
            setAgendaOriginRect(e.currentTarget.getBoundingClientRect());
            setAgendaDate(d);
          }}
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
          onEventClick={(event, e) => {
            setDetailOriginRect(e.currentTarget.getBoundingClientRect());
            setDetailEvent(event as unknown as CalendarEvent);
          }}
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
          agendaViewDate ? (
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
                {dayjs(agendaViewDate).format("dddd, MMMM D, YYYY")}
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
        transitionProps={agendaTransitionProps}
      >
        {agendaViewDate && (
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
              rangeStart={agendaViewDate}
              rangeEnd={agendaViewDate}
              events={events}
              styles={{ agendaViewHeader: { display: "none" } }}
              onEventClick={(event, e) => {
                setDetailOriginRect(e.currentTarget.getBoundingClientRect());
                setDetailEvent(event as unknown as CalendarEvent);
              }}
            />
          </div>
        )}
      </Modal>

      <EventDetail
        event={detailEvent}
        onClose={() => setDetailEvent(null)}
        onEdit={(event, originRect) => {
          setDetailEvent(null);
          setFormMinimized(false);
          setDraftTitle("");
          setFormOriginRect(originRect);
          setFormState({ event, defaultDate: today });
        }}
        onDeleted={() => {
          setDetailEvent(null);
          setAgendaDate(null);
          router.refresh();
        }}
        peopleNames={peopleNames}
        calendarNames={calendarNames}
        originRect={detailOriginRect}
      />

      <Modal.Root
        opened={formState !== null && !formMinimized}
        onClose={closeForm}
        keepMounted
        centered
        size="sm"
        zIndex={250}
        transitionProps={formTransitionProps}
      >
        <Modal.Overlay />
        <Modal.Content>
          <Modal.Header>
            <Modal.Title>{formState?.event ? "Edit event" : "New event"}</Modal.Title>
            <Group gap="xs" ml="auto">
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label="Minimize event form"
                onClick={() => {
                  // Shrink into the floating bubble (bottom-right) instead of
                  // wherever the form was opened from.
                  setFormOriginRect(null);
                  setFormMinimized(true);
                }}
              >
                <IconChevronDown size={16} />
              </ActionIcon>
              <Modal.CloseButton />
            </Group>
          </Modal.Header>
          <Modal.Body>
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
                onTitleChange={setDraftTitle}
                onDone={() => {
                  closeForm();
                  router.refresh();
                }}
              />
            )}
          </Modal.Body>
        </Modal.Content>
      </Modal.Root>

      {formState && formMinimized && (
        <FloatingToolbar zIndex={300}>
          <FloatingActionButton
            leftSection={<IconChevronUp size={16} />}
            onClick={() => setFormMinimized(false)}
          >
            <span
              style={{
                display: "block",
                maxWidth: "50vw",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {draftTitle || (formState.event ? "Edit event" : "New event")}
            </span>
          </FloatingActionButton>
          <ActionIcon
            radius="xl"
            size="lg"
            variant="default"
            aria-label="Discard draft"
            onClick={closeForm}
          >
            <IconX size={18} />
          </ActionIcon>
        </FloatingToolbar>
      )}

      <FilterModal
        opened={filterOpened}
        onClose={closeFilter}
        title="Filters"
        groups={filterGroups}
        values={filterValues}
        onApply={handleApplyFilters}
      />

      {formState === null && (
        <FloatingToolbar>
          <FloatingActionButton
            leftSection={<IconPlus size={18} />}
            onClick={(e) => openCreate(today, e.currentTarget.getBoundingClientRect())}
            disabled={!googleConfigured}
          >
            New event
          </FloatingActionButton>
        </FloatingToolbar>
      )}
    </Stack>
  );
}
