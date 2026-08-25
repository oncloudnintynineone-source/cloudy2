"use client";

import "@mantine/schedule/styles.css";

import dayjs from "dayjs";
import {
  use,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type Ref,
  type RefObject,
} from "react";
import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Group,
  Modal,
  Paper,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import type { ScheduleResourceData, ScheduleResourceGroup } from "@mantine/schedule";
import { IconBuilding, IconChevronLeft, IconChevronRight, IconPlus } from "@tabler/icons-react";

import {
  AgendaListSkeleton,
  MonthGridSkeleton,
  ScheduleGridSkeleton,
  WeekGridSkeleton,
  WeekMatrixSkeleton,
  monthGridRows,
} from "./calendarSkeleton";
import {
  AgendaViewLazy,
  MonthViewLazy,
  ResourcesDayViewLazy,
  ResourcesWeekViewLazy,
  WeekMatrixViewLazy,
  ensureActiveView,
} from "./lazy";
import { TimeRulerStrip, WeekDayLabelStrip } from "./strips";
import { eventsOnDay } from "@/lib/events/agenda";
import type { CalendarEvent } from "@/lib/events/queries";
import {
  buildScheduleResources,
  expandScheduleEvents,
  isDepartmentRowId,
  type ScheduleResource,
  type ScheduleUser,
} from "@/lib/events/schedule";
import { CONTENT_ENTER_CLASS, useContentEnter } from "@/lib/loading/contentEnter";
import type { Rect } from "@/lib/motion/origin";
import type { ViewMode } from "./DashboardView";

/**
 * Skeleton for the events area, shaped by the optimistic view (same contract
 * as loading.tsx). Used both while a navigation/refresh transition holds the
 * grid and as the Suspense fallback while the streamed events promise is in
 * flight.
 */
export function ViewLoadingSkeleton({
  shownView,
  shownMonth,
}: {
  shownView: ViewMode;
  shownMonth: string;
}) {
  const shownIsWeekV2 = shownView === "weekv2";
  const shownIsWeek = shownView === "week" || shownIsWeekV2;
  const shownIsAgenda = shownView === "agenda";
  return shownView === "month" ? (
    <MonthGridSkeleton rows={monthGridRows(shownMonth)} />
  ) : shownIsWeekV2 ? (
    <WeekMatrixSkeleton />
  ) : shownIsWeek ? (
    <WeekGridSkeleton />
  ) : shownIsAgenda ? (
    <AgendaListSkeleton />
  ) : (
    <ScheduleGridSkeleton />
  );
}

type ScrollAreaPropsShim = {
  viewportRef: RefObject<HTMLDivElement | null>;
  onScrollPositionChange: (position: { x: number }) => void;
};

interface EventsAreaProps {
  /** Streamed from the page: resolved with React's `use` inside this boundary. */
  events: Promise<CalendarEvent[]>;
  /**
   * Event group id from the `?edit=` deep link; resolved against the loaded
   * events and reported to the parent (which opens the edit form).
   */
  initialEditEventId: string | null;
  onEditLinkResolved: (event: CalendarEvent) => void;
  /** Fired once per mount, when the committed events have landed. */
  onEventsResolved: () => void;
  view: ViewMode;
  /** Optimistic chrome values drive the skeleton flavor and strips. */
  shownView: ViewMode;
  shownMonth: string;
  month: string;
  date: string;
  /** Monday-first week for the week views (null outside them), from the optimistic chrome. */
  week: string[] | null;
  /** Grid skeleton hold (pending navigation / force refresh). */
  gridLoading: boolean;
  isDesktop: boolean;
  googleConfigured: boolean;
  /** Height of the sticky chrome block the strips dock below. */
  chromeHeight: number;
  scheduleLabelWidths: { resource: string; group: string };
  weekSlotWidth: string | undefined;
  today: string;
  calendars: { id: string; name: string }[];
  selectedCalendarIds: string[];
  scheduleUsers: ScheduleUser[];
  /** Full active roster: row source when the Users filter narrows the rows. */
  allActiveUsers: ScheduleUser[];
  selectedUserIds: string[];
  /** Which day (0-6) sits at the left edge of the Week grid (parent-tracked). */
  weekDayIndex: number;
  /** Written by the slot-measurement effect; read by the parent's scroll handler. */
  weekDayWidthRef: RefObject<number>;
  weekRulerRef: RefObject<HTMLDivElement | null>;
  dayRulerRef: RefObject<HTMLDivElement | null>;
  weekViewportRef: RefObject<HTMLDivElement | null>;
  dayViewportRef: RefObject<HTMLDivElement | null>;
  weekScrollAreaProps: ScrollAreaPropsShim;
  dayScrollAreaProps: ScrollAreaPropsShim;
  // Agenda day modal + Agenda tab: state lives in the parent (the chrome's
  // date nav acts on it); this area renders both surfaces.
  agendaDate: string | null;
  setAgendaDate: (date: string | null) => void;
  setAgendaSlideDir: (dir: 0 | 1 | -1) => void;
  agendaSlideDir: 0 | 1 | -1;
  setAgendaOriginRect: (rect: Rect | null) => void;
  agendaTransitionProps: ComponentProps<typeof Modal>["transitionProps"];
  // Mantine's `useDrag` hands back a ref callback (created in the parent,
  // which owns the gesture state), so this takes the wider `Ref` union.
  agendaSwipeRef: Ref<HTMLDivElement>;
  agendaTabSwipeRef: Ref<HTMLDivElement>;
  swipedRef: RefObject<boolean>;
  /** The day the Agenda tab shows and its navigation acts on. */
  headerDate: string;
  shiftAgendaDay: (delta: number) => void;
  onEventClick: (event: CalendarEvent, originRect: DOMRect) => void;
  openCreate: (dateValue: string, originRect?: Rect | null) => void;
}

/**
 * The dashboard's data area: everything that depends on the streamed events
 * promise (the grid, the strips, the agenda tab + day modal, the `?edit=`
 * deep-link resolution). Suspends on `use(events)` until the promise the page
 * created resolves — the shell and chrome around it paint first.
 */
export function EventsArea({
  events: eventsPromise,
  initialEditEventId,
  onEditLinkResolved,
  onEventsResolved,
  view,
  shownView,
  shownMonth,
  month,
  date,
  week,
  gridLoading,
  isDesktop,
  googleConfigured,
  chromeHeight,
  scheduleLabelWidths,
  weekSlotWidth,
  today,
  calendars,
  selectedCalendarIds,
  scheduleUsers,
  allActiveUsers,
  selectedUserIds,
  weekDayIndex,
  weekDayWidthRef,
  weekRulerRef,
  dayRulerRef,
  weekViewportRef,
  dayViewportRef,
  weekScrollAreaProps,
  dayScrollAreaProps,
  agendaDate,
  setAgendaDate,
  setAgendaSlideDir,
  agendaSlideDir,
  setAgendaOriginRect,
  agendaTransitionProps,
  agendaSwipeRef,
  agendaTabSwipeRef,
  swipedRef,
  headerDate,
  shiftAgendaDay,
  onEventClick,
  openCreate,
}: EventsAreaProps) {
  const events = use(eventsPromise);

  // Prime the active view's chunk during render (idempotent, no-op on the
  // server) so its download overlaps hydration instead of blocking first paint.
  ensureActiveView(view);

  const weekBoxRef = useRef<HTMLDivElement | null>(null);
  const isWeekV2 = view === "weekv2";
  const isWeek = view === "week" || isWeekV2;
  const isSchedule = view === "schedule";
  const userFilterActive = selectedUserIds.length > 0;

  const scheduleDepartments = useMemo(
    () => calendars.filter((calendar) => selectedCalendarIds.includes(calendar.id)),
    [calendars, selectedCalendarIds],
  );
  const scheduleResources = useMemo(
    () =>
      buildScheduleResources({
        departments: userFilterActive ? calendars : scheduleDepartments,
        users: userFilterActive ? allActiveUsers : scheduleUsers,
        events,
        userFilter: selectedUserIds,
      }),
    [
      userFilterActive,
      calendars,
      scheduleDepartments,
      scheduleUsers,
      allActiveUsers,
      events,
      selectedUserIds,
    ],
  );
  const scheduleEvents = useMemo(() => expandScheduleEvents(events), [events]);

  // The `?edit=` deep link (from a Google Calendar "Edit:" note) resolves its
  // target once the events have landed; the parent opens the edit form. A
  // failure is a pure derivation (id set, no loaded event carries it) — no
  // state to sync; only the success is a one-shot side effect for the parent.
  const initialEditEvent = initialEditEventId
    ? (events.find((event) => event.payload.eventId === initialEditEventId) ?? null)
    : null;
  const editLinkFailed = initialEditEventId !== null && initialEditEvent === null;
  // The failure is derived from props (and would re-assert on every render),
  // so dismissal needs its own flag. Re-arming only happens on a fresh `?edit=`
  // deep link (a new mount).
  const [editLinkDismissed, setEditLinkDismissed] = useState(false);
  const editLinkReportedRef = useRef(false);
  useEffect(() => {
    if (!initialEditEventId || !initialEditEvent || editLinkReportedRef.current) {
      return;
    }
    editLinkReportedRef.current = true;
    onEditLinkResolved(initialEditEvent);
  }, [initialEditEventId, initialEditEvent, onEditLinkResolved]);

  useEffect(() => {
    onEventsResolved();
  }, [onEventsResolved]);

  useContentEnter(weekBoxRef, !gridLoading);

  // The day shown in the agenda day modal; persists through the exit
  // animation so the shrinking box still has content.
  const [displayAgendaDate, setDisplayAgendaDate] = useState<string | null>(agendaDate);
  const [prevAgendaDate, setPrevAgendaDate] = useState<string | null>(agendaDate);
  if (agendaDate && agendaDate !== prevAgendaDate) {
    setPrevAgendaDate(agendaDate);
    setDisplayAgendaDate(agendaDate);
  }
  const agendaViewDate = agendaDate ?? displayAgendaDate;

  // Mantine's AgendaView leaks adjacent-day all-day events into the selected
  // day (its day-granularity end check lets an exclusive end land exactly on
  // the viewed midnight), so pre-filter to exactly the occupying events.
  const agendaTabEvents = useMemo(() => eventsOnDay(events, headerDate), [events, headerDate]);
  const agendaModalEvents = useMemo(
    () => (agendaViewDate ? eventsOnDay(events, agendaViewDate) : []),
    [events, agendaViewDate],
  );

  // Measure the schedule views' actual hourly slot width and sync the pinned
  // rulers with it. Mantine sizes each hour slot in `rem`
  // (`--resources-*-view-slot-width`), so with a non-default root font size or
  // --mantine-scale a hardcoded px guess would drift. Probe the CSS variable
  // on the active view's root (found among the Box's children by the variable
  // it declares); the Week day index stores 24 slots' worth. The measured slot
  // is published to the rulers as `--ruler-slot` on the content box — direct
  // DOM writes, pre-paint (no state). Runs on mount (this area remounts when
  // the streamed events land) and only when the Day/Week grid is actually
  // rendered (not the skeleton or the empty "No users" paper).
  useLayoutEffect(() => {
    const isWeekGrid = view === "week";
    const isDayGrid = isSchedule;
    if ((!isWeekGrid && !isDayGrid) || gridLoading) {
      return;
    }
    const box = weekBoxRef.current;
    if (!box) {
      return;
    }
    const varName = isWeekGrid
      ? "--resources-week-view-slot-width"
      : "--resources-day-view-slot-width";
    const root = Array.from(box.children).find(
      (child) => getComputedStyle(child).getPropertyValue(varName).trim() !== "",
    );
    if (!root) {
      return;
    }
    const probe = document.createElement("span");
    probe.style.width = `var(${varName})`;
    root.append(probe);
    const slot = probe.offsetWidth;
    root.removeChild(probe);
    if (slot > 0) {
      weekDayWidthRef.current = slot * 24;
      box.style.setProperty("--ruler-slot", `${slot}px`);
    }
    // The library's start-scroll effects (startScrollTime /
    // startScrollDateTime) repositioned the grid before paint without a
    // scroll event; align the ruler tracks with the real scroll offset.
    const viewport = isWeekGrid ? weekViewportRef.current : dayViewportRef.current;
    const ruler = isWeekGrid ? weekRulerRef.current : dayRulerRef.current;
    if (viewport && ruler) {
      ruler.style.transform = `translateX(${-viewport.scrollLeft}px)`;
    }
  }, [view, gridLoading, isSchedule, isDesktop, weekDayWidthRef, weekViewportRef, dayViewportRef, weekRulerRef, dayRulerRef]);

  // Shared by the Day and Week resource views: a department row is a building
  // icon (its name as tooltip/aria), a user row is the shortname label.
  function renderResourceLabel(resource: ScheduleResourceData) {
    const row = resource as ScheduleResource;
    return isDepartmentRowId(row.id) ? (
      <IconBuilding
        size={16}
        color="var(--mantine-color-accent-6)"
        aria-label={row.fullName}
        title={row.fullName}
        style={{ flexShrink: 0 }}
      />
    ) : row.label === row.fullName ? (
      <Text size="sm">{row.label}</Text>
    ) : (
      // `events` replaces the default object, so `hover` is restated explicitly;
      // `touch` lets a tap open the tooltip on phones (tap-outside dismisses it).
      <Tooltip
        label={row.fullName}
        position="right"
        events={{ hover: true, focus: false, touch: true }}
      >
        <Text size="sm" aria-label={row.fullName}>
          {row.label}
        </Text>
      </Tooltip>
    );
  }

  function renderGroupLabel(group: ScheduleResourceGroup) {
    return <span style={{ writingMode: "vertical-rl" }}>{group.label}</span>;
  }

  return (
    <>
      {editLinkFailed && !editLinkDismissed && (
        <Alert
          color="yellow"
          title="Could not open that event"
          withCloseButton
          onClose={() => setEditLinkDismissed(true)}
        >
          It is not in your current view — adjust the calendar filters or check the date of the
          event.
        </Alert>
      )}

      <Box ref={weekBoxRef} className={CONTENT_ENTER_CLASS}>
        {view === "week" && week && (
          <WeekDayLabelStrip
            day={week[weekDayIndex]}
            hasGroups={scheduleResources.groups !== undefined}
            resourceLabelWidth={scheduleLabelWidths.resource}
            groupLabelWidth={scheduleLabelWidths.group}
            chromeOffset={chromeHeight}
          />
        )}
        {/* Pinned hour rulers for the schedule views. Only rendered with the
            real grid (not skeleton/empty state) so the measured slot width is
            meaningful; the Week one stacks beneath its day-label strip. */}
        {!gridLoading && view === "week" && week && scheduleResources.resources.length > 0 && (
          <TimeRulerStrip
            hasGroups={scheduleResources.groups !== undefined}
            resourceLabelWidth={scheduleLabelWidths.resource}
            groupLabelWidth={scheduleLabelWidths.group}
            chromeOffset={chromeHeight}
            stackBelowHeight="calc(var(--mantine-scale) * 2rem)"
            innerRef={weekRulerRef}
          />
        )}
        {!gridLoading && view === "schedule" && scheduleResources.resources.length > 0 && (
          <TimeRulerStrip
            hasGroups={scheduleResources.groups !== undefined}
            resourceLabelWidth={scheduleLabelWidths.resource}
            groupLabelWidth={scheduleLabelWidths.group}
            chromeOffset={chromeHeight}
            innerRef={dayRulerRef}
          />
        )}
        {gridLoading ? (
          // Skeleton flavor follows the optimistic view: the shape you tapped
          // is what appears to load (same contract as loading.tsx, which
          // resolves the remembered view from the cookie).
          <ViewLoadingSkeleton shownView={shownView} shownMonth={shownMonth} />
        ) : view === "month" ? (
          <MonthViewLazy
            date={`${month}-01 00:00:00`}
            events={events}
            withHeader={false}
            maxEventsPerDay={isDesktop ? 4 : 3}
            onEventClick={(event, e) => {
              onEventClick(event as unknown as CalendarEvent, e.currentTarget.getBoundingClientRect());
            }}
            onDayClick={(d, e) => {
              setAgendaOriginRect(e.currentTarget.getBoundingClientRect());
              // A fresh open animates with the modal itself, not a day slide.
              setAgendaSlideDir(0);
              setAgendaDate(d);
            }}
          />
        ) : view === "agenda" ? (
          <div
            ref={agendaTabSwipeRef}
            style={{ touchAction: "pan-y", overflow: "hidden" }}
            onClickCapture={(event) => {
              if (swipedRef.current) {
                event.preventDefault();
                event.stopPropagation();
                swipedRef.current = false;
              }
            }}
          >
            {/* The day key restarts the directional slide-in on every day
                change; month edges get the reveal fade instead (slide dir is
                cleared for those). */}
            <div
              key={headerDate}
              className={
                agendaSlideDir === 1
                  ? "agenda-slide-next"
                  : agendaSlideDir === -1
                    ? "agenda-slide-prev"
                    : undefined
              }
            >
              <AgendaViewLazy
                rangeStart={headerDate}
                rangeEnd={headerDate}
                events={agendaTabEvents}
                // The view root is an unstyled Box, so the shared boxed look of
                // the other views comes from here. The nav row above already
                // shows the day, so only the stock per-day group header is kept.
                style={{
                  border: "1px solid var(--mantine-color-default-border)",
                  borderRadius: "var(--mantine-radius-md)",
                  overflow: "hidden",
                }}
                styles={{ agendaViewHeader: { display: "none" } }}
                onEventClick={(event, e) => {
                  onEventClick(
                    event as unknown as CalendarEvent,
                    e.currentTarget.getBoundingClientRect(),
                  );
                }}
              />
            </div>
          </div>
        ) : scheduleResources.resources.length === 0 ? (
          <Paper withBorder radius="md" p="lg">
            <Text size="sm" c="dimmed">
              {userFilterActive
                ? "No active users match the Users filter. Adjust the filter."
                : "No users in the selected calendars yet. Assign users to a department (Admin Settings) or adjust the filters."}
            </Text>
          </Paper>
        ) : isWeekV2 && week ? (
          <WeekMatrixViewLazy
            days={week}
            resources={scheduleResources.resources}
            groups={scheduleResources.groups}
            events={events}
            today={today}
            renderResourceLabel={renderResourceLabel}
            onEventClick={(event, e) => {
              onEventClick(event, e.currentTarget.getBoundingClientRect());
            }}
            onCellClick={(day, e) => {
              if (!googleConfigured) {
                return; // Same guard as the "New event" FAB.
              }
              openCreate(day, e.currentTarget.getBoundingClientRect());
            }}
            chromeOffset={chromeHeight}
          />
        ) : isWeek ? (
          <ResourcesWeekViewLazy
            date={date}
            resources={scheduleResources.resources}
            groups={scheduleResources.groups}
            events={scheduleEvents}
            startTime="00:00:00"
            endTime="23:59:59"
            intervalMinutes={60}
            rowHeight={56}
            withHeader={false}
            withCurrentTimeIndicator
            // Open at Monday 07:00 like the Day view (mount-only effect;
            // week-to-week navigation keeps the current scroll position).
            startScrollDateTime={week ? `${week[0]} 07:00:00` : undefined}
            onEventClick={(event, e) => {
              onEventClick(
                event as unknown as CalendarEvent,
                e.currentTarget.getBoundingClientRect(),
              );
            }}
            // The resource-label column width is not a typed ResourcesWeekView
            // var, so it is set as a CSS variable on the root (cascades to the
            // all-day sticky labels and the time-indicator offset the same way
            // the Day view's typed var does). Desktop widens the columns and
            // the hour slots (see scheduleLabelWidths/weekSlotWidth above).
            style={
              {
                "--resources-week-view-resource-label-width": scheduleLabelWidths.resource,
                ...(weekSlotWidth ? { "--resources-week-view-slot-width": weekSlotWidth } : {}),
              } as CSSProperties
            }
            vars={() => ({
              resourcesWeekView: {
                "--resources-week-view-group-label-width": scheduleLabelWidths.group,
              },
            })}
            styles={{
              // Replaced by the pinned WeekDayLabelStrip above (Mantine's own
              // labels center in each 1440px-wide day column, so they are
              // effectively invisible on a phone). The strip must sit directly
              // above the grid, so it lives outside the scroll area. The time
              // labels are replaced the same way by the pinned TimeRulerStrip.
              resourcesWeekViewDayLabelsRow: { display: "none" },
              resourcesWeekViewTimeLabelsRow: { display: "none" },
              resourcesWeekViewResourceLabel: {
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                paddingInline: 0,
              },
            }}
            labels={{ resources: "" }}
            // onScrollPositionChange feeds the pinned day-label strip and the
            // ruler's translateX tracking; viewportRef syncs the ruler after
            // mount/loads (see the layout effect above).
            scrollAreaProps={weekScrollAreaProps}
            renderResourceLabel={renderResourceLabel}
            renderGroupLabel={renderGroupLabel}
          />
        ) : (
          <ResourcesDayViewLazy
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
              onEventClick(
                event as unknown as CalendarEvent,
                e.currentTarget.getBoundingClientRect(),
              );
            }}
            vars={() => ({
              resourcesDayView: {
                "--resources-day-view-resource-label-width": scheduleLabelWidths.resource,
                "--resources-day-view-group-label-width": scheduleLabelWidths.group,
              },
            })}
            styles={{
              // Replaced by the pinned TimeRulerStrip above (the library's own
              // row is sticky only inside its ScrollArea viewport, which never
              // scrolls vertically — the page does).
              resourcesDayViewTimeLabelsRow: { display: "none" },
              resourcesDayViewResourceLabel: {
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                paddingInline: 0,
              },
            }}
            labels={{ resources: "" }}
            // onScrollPositionChange feeds the ruler's translateX tracking;
            // viewportRef syncs it after mount/loads (layout effect above).
            scrollAreaProps={dayScrollAreaProps}
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
            renderResourceLabel={renderResourceLabel}
            renderGroupLabel={renderGroupLabel}
          />
        )}
      </Box>

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
        size={isDesktop ? "md" : "sm"}
        transitionProps={agendaTransitionProps}
      >
        {agendaViewDate && (
          <>
            <div
              ref={agendaSwipeRef}
              style={{
                touchAction: "pan-y",
                overflowY: "auto",
                maxHeight: isDesktop ? "70dvh" : "56dvh",
                overscrollBehavior: "contain",
              }}
              onClickCapture={(event) => {
                if (swipedRef.current) {
                  event.preventDefault();
                  event.stopPropagation();
                  swipedRef.current = false;
                }
              }}
            >
              {/* The day key restarts the directional slide-in animation on
                  every day change; on close the key stays put via
                  displayAgendaDate, so the shrink-out never replays it. */}
              <div
                key={agendaViewDate}
                className={
                  agendaSlideDir === 1
                    ? "agenda-slide-next"
                    : agendaSlideDir === -1
                      ? "agenda-slide-prev"
                      : undefined
                }
              >
                <AgendaViewLazy
                  rangeStart={agendaViewDate}
                  rangeEnd={agendaViewDate}
                  events={agendaModalEvents}
                  styles={{ agendaViewHeader: { display: "none" } }}
                  onEventClick={(event, e) => {
                    onEventClick(
                      event as unknown as CalendarEvent,
                      e.currentTarget.getBoundingClientRect(),
                    );
                  }}
                />
              </div>
            </div>
            <Button
              w="100%"
              mt="sm"
              leftSection={<IconPlus size={20} />}
              disabled={!googleConfigured}
              onClick={(e) => {
                // Close the agenda and grow the event form out of the button,
                // prefilled with the day being viewed.
                const targetDate = agendaViewDate;
                setAgendaDate(null);
                openCreate(targetDate, e.currentTarget.getBoundingClientRect());
              }}
            >
              New event
            </Button>
          </>
        )}
      </Modal>
    </>
  );
}
