"use client";

import dayjs from "dayjs";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Menu,
  Modal,
  Paper,
  Stack,
  Tabs,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure, useDrag } from "@mantine/hooks";
import {
  AgendaView,
  MonthView,
  ResourcesDayView,
  ResourcesWeekView,
  type ScheduleResourceData,
  type ScheduleResourceGroup,
} from "@mantine/schedule";
import {
  IconBuilding,
  IconCalendarCheck,
  IconCalendarDot,
  IconCalendarMonth,
  IconCalendarUser,
  IconCalendarWeek,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconDotsVertical,
  IconFilter,
  IconLayoutGrid,
  IconListDetails,
  IconPlus,
  IconRefresh,
  IconUser,
  IconX,
} from "@tabler/icons-react";

import {
  AgendaListSkeleton,
  MonthGridSkeleton,
  ScheduleGridSkeleton,
  WeekGridSkeleton,
  monthGridRows,
} from "./calendarSkeleton";
import { formatWeekLabel } from "./clientDateTime";
import { DateSelectorModal } from "@/components/DateSelectorModal";
import { FilterModal, type FilterGroup } from "@/components/FilterModal";
import {
  FAB_ICON_SIZE,
  FAB_SIZE,
  FloatingActionButton,
  FloatingToolbar,
} from "@/components/FloatingToolbar";
import { weekDays } from "@/lib/events/datetime";
import type { CalendarEvent } from "@/lib/events/queries";
import type { LocationPolicy } from "@/lib/events/locationPolicy";
import type { TimeOption } from "@/lib/events/timeOptions";
import { CONTENT_ENTER_CLASS, useContentEnter } from "@/lib/loading/contentEnter";
import { useMinSkeletonHold } from "@/lib/loading/minHoldLoading";
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
import { DASHBOARD_STATE_KEYS, freshMarkerNeeded } from "@/lib/ui/uiState";
import { usePersistUiState } from "@/lib/ui/uiStateClient";
import { EventDetail } from "./EventDetail";
import { EventForm } from "./EventForm";
import { WeekMatrixView } from "./WeekMatrixView";

type ViewMode = "month" | "week" | "weekv2" | "schedule" | "agenda";

interface EventTypeOption {
  name: string;
  shortname: string | null;
  timeOptions: TimeOption[];
  locationPolicy: LocationPolicy;
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
  /** Full active roster: row source when the Users filter narrows the rows. */
  allActiveUsers: ScheduleUser[];
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

// Fallback for the Week view's day-column width: 24 hourly slots × Mantine's
// default 60px slot width at the default scale. The real value is measured
// from the DOM (see the effect below) so non-default root font sizes still
// derive the correct day index.
const WEEK_DAY_WIDTH_PX = 24 * 60;

/**
 * Pinned day-label strip for the Week view. `ResourcesWeekView`'s own day
 * labels are centered in each full-width day column, so on a phone they are
 * only visible when the viewport happens to sit over the middle of a day.
 * This strip replaces that row and pins the leftmost visible day (the caller
 * tracks it via `onScrollPositionChange`) to the grid's left edge, styled
 * like Mantine's own day labels (today filled/primary, weekends red).
 */
function WeekDayLabelStrip({ day, hasGroups }: { day: string; hasGroups: boolean }) {
  const dayObj = dayjs(day);
  const isToday = dayObj.isSame(dayjs(), "day");
  const isWeekend = dayObj.day() === 0 || dayObj.day() === 6;
  // The width of the sticky corner/label columns the grid scrolls beneath,
  // matching the ResourcesWeekView sizing overrides on the view itself.
  const leftWidth = hasGroups ? "calc(1.5rem + 3rem)" : "3rem";
  return (
    <Box
      component="div"
      style={{
        position: "relative",
        height: "calc(2rem * var(--mantine-scale))",
        background: "var(--mantine-color-body)",
        borderBottom: "1px solid var(--mantine-color-default-border)",
      }}
    >
      {/* Continues the corner's vertical divider across the strip's band. */}
      <Box
        component="div"
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: leftWidth,
          borderRight: "1px solid var(--mantine-color-default-border)",
        }}
      />
      <span
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: leftWidth,
          display: "flex",
          alignItems: "center",
          paddingInline: "0.5rem",
          whiteSpace: "nowrap",
          fontSize: "var(--mantine-font-size-sm)",
          fontWeight: isToday
            ? "var(--mantine-font-weight-bold)"
            : "var(--mantine-font-weight-medium)",
          textTransform: "capitalize",
          userSelect: "none",
          background: isToday ? "var(--mantine-primary-color-filled)" : "transparent",
          color: isToday
            ? "var(--mantine-primary-color-contrast)"
            : isWeekend
              ? "var(--mantine-color-red-6)"
              : undefined,
        }}
      >
        {dayObj.format("ddd D")}
      </span>
    </Box>
  );
}

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
  allActiveUsers,
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
  // Facebook-bubble minimize: the form modal collapses into a floating circle
  // while `formMinimized` is true. The modal stays mounted (`keepMounted`) so
  // the draft survives.
  const [formMinimized, setFormMinimized] = useState(false);
  const [agendaDate, setAgendaDate] = useState<string | null>(null);
  // Direction of the last in-modal day change, so the new agenda can slide in
  // from the swipe/chevron direction (1 = next day, -1 = previous day,
  // 0 = none yet, e.g. right after the modal opened).
  const [agendaSlideDir, setAgendaSlideDir] = useState<0 | 1 | -1>(0);
  // The day the Agenda *tab* is showing (client source of truth while the tab
  // is up); null = follow the `?date=` prop. In-month changes apply locally
  // and sync the URL with a no-transition push so no skeleton flashes.
  const [viewedDay, setViewedDay] = useState<string | null>(null);
  // `?date=` prop value before the last day write from the Agenda tab: while
  // the prop still holds it, a prop ≠ viewedDay diff is our own write in
  // flight, not an external navigation to follow. State (not a ref) so the
  // render-phase sync below can read it.
  const [agendaUrlBase, setAgendaUrlBase] = useState<string | null>(null);
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
  const [pickerOpened, { open: openPicker, close: closePicker }] = useDisclosure(false);

  // Height of the sticky view-tabs bar, so the Week v2 pinned day header can
  // stick just below it. Measured before first paint (and on resize) so the
  // header never overlaps the tabs.
  const tabsListRef = useRef<HTMLDivElement | null>(null);
  const [tabsHeight, setTabsHeight] = useState(0);
  useLayoutEffect(() => {
    const el = tabsListRef.current;
    if (!el) {
      return;
    }
    const update = () => setTabsHeight(el.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Week view: which day (0-6) sits at the left edge of the horizontally
  // scrolling grid. The index (not raw px) drives the pinned day-label strip,
  // so a scroll frame only re-renders when the visible day actually changes.
  const weekDayWidthRef = useRef(WEEK_DAY_WIDTH_PX);
  const weekBoxRef = useRef<HTMLDivElement | null>(null);
  const [weekDayIndex, setWeekDayIndex] = useState(0);
  const handleWeekScroll = useCallback((pos: { x: number }) => {
    const index = Math.min(6, Math.max(0, Math.floor(pos.x / weekDayWidthRef.current)));
    setWeekDayIndex((prev) => (prev === index ? prev : index));
  }, []);
  // Stable identity: the week's ScrollArea must not receive a fresh
  // `scrollAreaProps` object on every scroll frame.
  const weekScrollAreaProps = useMemo(
    () => ({
      startScrollPosition: { y: 7 * 56 },
      onScrollPositionChange: handleWeekScroll,
    }),
    [handleWeekScroll],
  );

  const [isRefreshing, startRefresh] = useTransition();

  // Skeleton-only loading: any pending data navigation or force refresh
  // shows the grid skeleton. `useMinSkeletonHold` keeps it up for a minimum
  // ~350ms so fast (cached) loads read as a deliberate sequence instead of a
  // flash. `useContentEnter` fades the grid in on the reveal; on a cold
  // mount the class ships in the SSR HTML and plays on first paint. The
  // one-shot `edit`/`refresh` strips are plain pushes (no transition), so
  // they never set the pending flag and never replay the fade.
  const gridLoading = useMinSkeletonHold(isPending || isRefreshing);
  useContentEnter(weekBoxRef, !gridLoading);

  // Remembered UI state: persist the server-resolved view/filters to the
  // per-device cookie every time the rendered state changes, so a relaunch
  // (or F5) lands on exactly this view (see src/lib/ui/uiState.ts).
  usePersistUiState("dashboard", {
    view,
    date,
    month,
    cal: selectedCalendarIds,
    users: selectedUserIds,
    types: selectedTypes,
  });

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
  const week = view === "week" || view === "weekv2" ? weekDays(date) : null;
  const weekLabel = week ? formatWeekLabel(week[0], week[6]) : "";
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
              label: "My Events",
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
  // An active Users filter narrows the rows to exactly the selected users
  // (no department rows, no other users), so the filter visibly changes the
  // grid. The row source becomes the full active roster — a selected user gets
  // a row even when their department is outside the `cal` selection — and the
  // department list must cover each selected user's own department.
  const userFilterActive = selectedUserIds.length > 0;
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

  const isWeekV2 = view === "weekv2";
  const isWeek = view === "week" || isWeekV2;
  const isSchedule = view === "schedule";
  const isAgenda = view === "agenda";
  // Day-anchored views (Day, Week v2, Agenda): a `?date=` anchor drives the
  // fetch (Week v2 shows the Monday-first week containing the anchor day).
  const isAnchoredView = isSchedule || isWeekV2 || isAgenda;

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
      const query = searchParams.toString();
      const currentHref = query ? `${pathname}?${query}` : pathname;
      const plainHref = buildHref(updates);
      // A no-op navigation (e.g. tapping "Today" while already there) would
      // still run a transition, flashing the grid skeleton for nothing.
      // Checked before the `_fresh` injection below so "re-removing" an
      // already-absent key stays a no-op instead of a render round-trip.
      if (plainHref === currentHref) {
        return;
      }
      // When this navigation drops remembered keys (Clear, tab switch off an
      // anchored view), the next bare URL would fall back to the stale
      // remembered-state cookie — the one-shot `_fresh` marker makes this one
      // render use pure defaults; the state effect below re-persists the
      // freshly resolved values right after.
      const nextHref = freshMarkerNeeded(updates, DASHBOARD_STATE_KEYS)
        ? buildHref({ ...updates, _fresh: "1" })
        : plainHref;
      startTransition(() => {
        router.push(nextHref);
      });
    },
    [buildHref, router, startTransition, pathname, searchParams],
  );

  // Strip the one-shot `_fresh` marker after its render has mounted (self-
  // terminating, plain push — same pattern as the `refresh` strip below), so
  // the marker never survives into back/forward history.
  useEffect(() => {
    if (searchParams.get("_fresh") === null) {
      return;
    }
    router.push(buildHref({ _fresh: null }));
  }, [buildHref, router, searchParams]);

  // Strip the one-shot `edit` param from the URL so a refresh doesn't reopen
  // the edit form. A plain push (no transition): the grid shows no skeleton
  // and no fade for a URL-only change.
  const editParamClearedRef = useRef(false);
  useEffect(() => {
    if (!initialEditEventId || editParamClearedRef.current) {
      return;
    }
    editParamClearedRef.current = true;
    router.push(buildHref({ edit: null }));
  }, [buildHref, initialEditEventId, router]);

  // Strip the one-shot `refresh` nonce as soon as the forced render has
  // mounted, so later month/day navigation doesn't keep force-refreshing.
  // Self-terminating (stripping removes the param), and re-arms on every new
  // nonce — a ref guard would leak a second nonce if refresh is clicked
  // before the first strip lands. Plain push (no transition), same as the
  // edit strip above.
  useEffect(() => {
    if (searchParams.get("refresh") === null) {
      return;
    }
    router.push(buildHref({ refresh: null }));
  }, [buildHref, router, searchParams]);

  // Force refresh: a transition of its own (the button's spinner) wrapping
  // router.push directly — the transition Next runs inside push stays pending
  // for the whole navigation, so `isRefreshing` covers the load. The server
  // renders that same request with `force: true`; the grid skeleton shows for
  // the same window. Ordinary data navigations (month/week/day/view/filter)
  // show the same grid skeleton while pending and swap the new grid in place
  // (with a one-shot fade-in) when it commits.
  function refreshNow() {
    startRefresh(() => {
      router.push(buildHref({ refresh: String(Date.now()) }));
    });
  }

  function shiftMonth(delta: number) {
    const next = dayjs(`${month}-01`).add(delta, "month").format("YYYY-MM");
    navigate({ month: next });
  }

  function shiftDay(delta: number) {
    const next = dayjs(date).add(delta, "day");
    navigate({ date: next.format("YYYY-MM-DD"), month: next.format("YYYY-MM") });
  }

  function shiftWeek(delta: number) {
    const next = dayjs(date).add(delta, "week");
    navigate({ date: next.format("YYYY-MM-DD"), month: next.format("YYYY-MM") });
  }

  function switchView(next: string) {
    const mode: ViewMode =
      next === "schedule"
        ? "schedule"
        : next === "week"
          ? "week"
          : next === "weekv2"
            ? "weekv2"
            : next === "agenda"
              ? "agenda"
              : "month";
    if (mode !== "month") {
      if (mode === "agenda") {
        // A fresh entry re-follows the URL (the render-phase sync above
        // re-seeds viewedDay) and plays the reveal fade, not a stale slide.
        setViewedDay(null);
        setAgendaUrlBase(null);
        setAgendaSlideDir(0);
      }
      // Entering an anchored view (day/week/agenda) always starts on today; the
      // month is derived from the date by the page.
      navigate({ view: mode, month: null, date: today });
      return;
    }
    if (isAgenda) {
      // Leaving the Agenda tab drops the local day so a later entry (which
      // navigates to today) seeds it cleanly instead of resurrecting a stale
      // view or a half-committed URL write.
      setViewedDay(null);
      setAgendaUrlBase(null);
    }
    // Leaving a date-anchored view keeps the currently viewed month visible;
    // the month is derived from the anchor date for week and agenda/day alike.
    navigate({
      view: null,
      month: isWeek || isAnchoredView ? date.slice(0, 7) : null,
      date: null,
    });
  }

  function goToday() {
    if (isAgenda) {
      applyAgendaDay(today);
      return;
    }
    if (isAnchoredView) {
      navigate({ date: today, month: todayMonth });
    } else {
      navigate({ month: todayMonth });
    }
  }

  function pickDate(picked: string) {
    navigate({ date: picked, month: picked.slice(0, 7) });
  }

  /**
   * Applies a day change in the Agenda tab. The viewed day and the slide
   * direction update locally and immediately; `?date=` is kept in sync — with
   * a plain no-transition push in-month (no new fetch identity, so the page
   * re-renders silently behind the slide) or a data navigation across a month
   * edge (skeleton + reveal fade, no slide). Refresh/back/deep links always
   * resolve to the viewed day.
   */
  function applyAgendaDay(next: string) {
    const current = viewedDay ?? date;
    if (next === current) {
      return; // No-op (e.g. Today while already on it): no skeleton, no slide.
    }
    setViewedDay(next);
    setAgendaUrlBase(date);
    const nextMonth = next.slice(0, 7);
    if (nextMonth !== month) {
      // The server must fetch the new month; the skeleton + reveal fade
      // replace the directional slide, so clear it.
      setAgendaSlideDir(0);
      navigate({ date: next, month: nextMonth });
      return;
    }
    setAgendaSlideDir(dayjs(next).isAfter(dayjs(current)) ? 1 : -1);
    // Plain push outside startTransition: it never sets the pending flag
    // (same pattern as the ?edit=/?refresh= URL strips), so no skeleton.
    router.push(buildHref({ date: next }));
  }

  function shiftAgendaDay(delta: number) {
    if (agendaDate === null) return;
    const next = dayjs(agendaDate).add(delta, "day");
    setAgendaSlideDir(delta > 0 ? 1 : -1);
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

  // Same gesture for the Agenda tab (the ref only ever attaches to the tab's
  // list, so the two instances are mutually exclusive and share the
  // swipedRef click-suppression flag safely).
  const { ref: agendaTabSwipeRef } = useDrag<HTMLDivElement>(
    (state) => {
      if (!state.last || state.canceled || state.tap) return;
      if (!isAgenda) return;
      if (Math.abs(state.movement[0]) < DAY_SWIPE_THRESHOLD) return;
      swipedRef.current = true;
      const base = viewedDay ?? date;
      applyAgendaDay(
        dayjs(base)
          .add(state.movement[0] < 0 ? 1 : -1, "day")
          .format("YYYY-MM-DD"),
      );
    },
    { axis: "lock", axisThreshold: 8, threshold: 10, filterTaps: true },
  );

  // Draggable minimized bubble: pointer-based so it works for both mouse and
  // touch. A tap (movement under the threshold) restores the form; a drag
  // repositions the pill, clamped to the viewport.
  function handleApplyFilters(values: Record<string, string[]>) {
    const cals = values.Calendars ?? [];
    const users = values.Users ?? [];
    const types = values["Event Types"] ?? [];
    navigate({
      cal: cals.length > 0 ? cals.join(",") : null,
      users: users.length > 0 ? users.join(",") : null,
      types: types.length > 0 ? types.join(",") : null,
    });
  }

  const onlyMeActive = selectedUserIds.length === 1 && selectedUserIds[0] === currentUser;
  const onlyMeAvailable = filterUsers.some((user) => user.id === currentUser);

  function toggleOnlyMe(checked: boolean) {
    // Search groups: empty selection means "no filter", so unchecked clears
    // the Users filter entirely.
    navigate({ users: checked ? currentUser : null });
  }

  function clearFilters() {
    // Null params restore the server defaults (non-admins default to their
    // own department's calendar).
    navigate({ cal: null, users: null, types: null });
  }

  function openCreate(dateValue: string, originRect: Rect | null = null) {
    setFormMinimized(false);
    setFormOriginRect(originRect);
    setFormState({ event: null, defaultDate: dateValue });
  }

  function closeForm() {
    setFormMinimized(false);
    setFormState(null);
  }

  // Keep the Agenda tab's local day in sync with the URL (setState during
  // render, the same pattern as the modal's displayAgendaDate hold): null
  // seeds it on entry; an external `?date=` change (back/forward, deep link,
  // re-entry after leaving the tab) wins; while one of our own writes is
  // still in flight (the prop still holds the pre-write value) the local day
  // is kept.
  if (isAgenda) {
    if (viewedDay === null) {
      setViewedDay(date);
    } else if (viewedDay !== date) {
      if (agendaUrlBase === null || date !== agendaUrlBase) {
        setViewedDay(date);
      }
    } else if (agendaUrlBase !== null) {
      // Our write committed; clear the in-flight marker. Guarded: a
      // render-phase setState with an unchanged value still schedules a
      // re-render (no eager bail-out), so dispatching unconditionally
      // would loop until React's "Too many re-renders" limit.
      setAgendaUrlBase(null);
    }
  }

  // The day the Agenda tab shows and its navigation acts on; in the other
  // views this is identical to the `?date=` prop.
  const headerDate = isAgenda ? (viewedDay ?? date) : date;
  const onToday = isWeek
    ? week !== null && week.some((day) => day === today)
    : isAnchoredView
      ? headerDate === today
      : month === todayMonth;

  // Measure the Week view's actual day-column width. Mantine sizes each hour
  // slot in `rem` (`--resources-week-view-slot-width`), so with a non-default
  // root font size 24×60px would pick the wrong day while scrolling. Probe the
  // CSS variable on the view's root (found among the Box's children by the
  // variable it declares) and store 24 slots worth as the day width. Runs only
  // when the week grid is actually rendered (not the skeleton or the empty
  // "No users" paper).
  useEffect(() => {
    if (view !== "week" || gridLoading) {
      return;
    }
    const box = weekBoxRef.current;
    if (!box) {
      return;
    }
    const root = Array.from(box.children).find(
      (child) =>
        getComputedStyle(child).getPropertyValue("--resources-week-view-slot-width").trim() !== "",
    );
    if (!root) {
      return;
    }
    const probe = document.createElement("span");
    probe.style.width = "var(--resources-week-view-slot-width)";
    root.append(probe);
    const slot = probe.offsetWidth;
    root.removeChild(probe);
    if (slot > 0) {
      weekDayWidthRef.current = slot * 24;
    }
  }, [view, gridLoading]);

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
      <Tooltip label={row.fullName} position="right">
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
    <Stack pb="xl" gap="sm">
      {/* The sticky view-tabs bar. The wrapper is a direct child of the Stack,
          so its containing block spans the whole page and sticky can hold it at
          the top (a sticky element pinned to the Tabs root alone can't — that
          root is only as tall as the tab bar and scrolls away with it). */}
      <Box
        ref={tabsListRef}
        style={{
          position: "sticky",
          top: "var(--app-shell-header-offset)",
          zIndex: 10,
          background: "var(--mantine-color-body)",
        }}
      >
        <Tabs
          value={view}
          onChange={(next) => switchView(next ?? "month")}
          aria-label="Calendar view"
          styles={{ tab: { flex: 1 } }}
        >
          <Tabs.List
            style={{
              borderBottom: "1px solid var(--mantine-color-default-border)",
            }}
          >
            <Tabs.Tab value="month">
              <Group gap="xs" justify="center" wrap="nowrap">
                <IconCalendarMonth size={16} />
                <Text fw={600} size="sm">
                  Month
                </Text>
              </Group>
            </Tabs.Tab>
            <Tabs.Tab value="week">
              <Group gap="xs" justify="center" wrap="nowrap">
                <IconCalendarWeek size={16} />
                <Text fw={600} size="sm">
                  Week
                </Text>
              </Group>
            </Tabs.Tab>
            <Tabs.Tab value="weekv2">
              <Group gap="xs" justify="center" wrap="nowrap">
                <IconLayoutGrid size={16} />
                <Text fw={600} size="sm" style={{ whiteSpace: "nowrap" }}>
                  Week v2
                </Text>
              </Group>
            </Tabs.Tab>
            <Tabs.Tab value="schedule">
              <Group gap="xs" justify="center" wrap="nowrap">
                <IconCalendarUser size={16} />
                <Text fw={600} size="sm">
                  Day
                </Text>
              </Group>
            </Tabs.Tab>
            <Tabs.Tab value="agenda">
              <Group gap="xs" justify="center" wrap="nowrap">
                <IconListDetails size={16} />
                <Text fw={600} size="sm">
                  Agenda
                </Text>
              </Group>
            </Tabs.Tab>
          </Tabs.List>
        </Tabs>
      </Box>

      <Group align="center" gap="xs" wrap="nowrap">
        <ActionIcon
          size={43}
          variant="default"
          aria-label={isWeek ? "Previous week" : isAnchoredView ? "Previous day" : "Previous month"}
          onClick={() =>
            isAgenda
              ? applyAgendaDay(dayjs(headerDate).add(-1, "day").format("YYYY-MM-DD"))
              : isWeek
                ? shiftWeek(-1)
                : isAnchoredView
                  ? shiftDay(-1)
                  : shiftMonth(-1)
          }
        >
          <IconChevronLeft size={18} />
        </ActionIcon>
        <Text
          fw={600}
          size="lg"
          lineClamp={1}
          style={{ flex: 1, minWidth: 0, textAlign: "center" }}
        >
          {isAgenda
            ? dayjs(headerDate).format("ddd, MMM D, YYYY")
            : isWeek
              ? weekLabel
              : isAnchoredView
                ? dayLabel
                : monthLabel}
        </Text>
        <ActionIcon
          size={43}
          variant="default"
          aria-label={isWeek ? "Next week" : isAnchoredView ? "Next day" : "Next month"}
          onClick={() =>
            isAgenda
              ? applyAgendaDay(dayjs(headerDate).add(1, "day").format("YYYY-MM-DD"))
              : isWeek
                ? shiftWeek(1)
                : isAnchoredView
                  ? shiftDay(1)
                  : shiftMonth(1)
          }
        >
          <IconChevronRight size={18} />
        </ActionIcon>
        <Menu
          shadow="md"
          width={200}
          position="bottom-end"
          transitionProps={{ transition: "pop-top-right", duration: 150, timingFunction: "ease" }}
        >
          <Menu.Target>
            <Box pos="relative">
              <ActionIcon size={43} variant="default" aria-label="More options">
                <IconDotsVertical size={18} />
              </ActionIcon>
              {activeFilterCount > 0 && (
                <Badge
                  size="sm"
                  variant="filled"
                  radius="xl"
                  pos="absolute"
                  style={{ top: -4, right: -4 }}
                >
                  {activeFilterCount}
                </Badge>
              )}
            </Box>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<IconCalendarCheck size={16} />}
              disabled={onToday}
              onClick={goToday}
            >
              Today
            </Menu.Item>
            {isAnchoredView && (
              <Menu.Item leftSection={<IconCalendarDot size={16} />} onClick={openPicker}>
                Select date
              </Menu.Item>
            )}
            <Menu.Divider />
            <Menu.Label>Filters</Menu.Label>
            {onlyMeAvailable && (
              <Menu.CheckboxItem checked={onlyMeActive} onChange={toggleOnlyMe} closeMenuOnClick>
                My Events
              </Menu.CheckboxItem>
            )}
            <Menu.Item
              leftSection={<IconX size={16} />}
              disabled={activeFilterCount === 0}
              onClick={clearFilters}
            >
              Clear
            </Menu.Item>
            <Menu.Item
              leftSection={<IconFilter size={16} />}
              onClick={openFilter}
              rightSection={
                activeFilterCount > 0 ? (
                  <Badge size="sm" variant="filled" radius="xl">
                    {activeFilterCount}
                  </Badge>
                ) : null
              }
            >
              More Filters
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item
              leftSection={
                isRefreshing ? <Loader size="sm" color="gray" /> : <IconRefresh size={16} />
              }
              disabled={!googleConfigured || isRefreshing}
              onClick={refreshNow}
            >
              Force refresh
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
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

      <Box ref={weekBoxRef} className={CONTENT_ENTER_CLASS}>
        {view === "week" && week && (
          <WeekDayLabelStrip
            day={week[weekDayIndex]}
            hasGroups={scheduleResources.groups !== undefined}
          />
        )}
        {gridLoading ? (
          view === "month" ? (
            <MonthGridSkeleton rows={monthGridRows(month)} />
          ) : isWeek ? (
            <WeekGridSkeleton />
          ) : isAgenda ? (
            <AgendaListSkeleton />
          ) : (
            <ScheduleGridSkeleton />
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
              // A fresh open animates with the modal itself, not a day slide.
              setAgendaSlideDir(0);
              setAgendaDate(d);
            }}
          />
        ) : isAgenda ? (
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
              <AgendaView
                rangeStart={headerDate}
                rangeEnd={headerDate}
                events={events}
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
                  setDetailOriginRect(e.currentTarget.getBoundingClientRect());
                  setDetailEvent(event as unknown as CalendarEvent);
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
          <WeekMatrixView
            days={week}
            resources={scheduleResources.resources}
            groups={scheduleResources.groups}
            events={events}
            today={today}
            renderResourceLabel={renderResourceLabel}
            onEventClick={(event, e) => {
              setDetailOriginRect(e.currentTarget.getBoundingClientRect());
              setDetailEvent(event);
            }}
            onCellClick={(day, e) => {
              if (!googleConfigured) {
                return; // Same guard as the "New event" FAB.
              }
              openCreate(day, e.currentTarget.getBoundingClientRect());
            }}
            tabBarOffset={tabsHeight}
          />
        ) : isWeek ? (
          <ResourcesWeekView
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
            onEventClick={(event, e) => {
              setDetailOriginRect(e.currentTarget.getBoundingClientRect());
              setDetailEvent(event as unknown as CalendarEvent);
            }}
            // The resource-label column width is not a typed ResourcesWeekView
            // var, so it is set as a CSS variable on the root (cascades to the
            // all-day sticky labels and the time-indicator offset the same way
            // the Day view's typed var does).
            style={{ "--resources-week-view-resource-label-width": "3rem" } as CSSProperties}
            vars={() => ({
              resourcesWeekView: {
                "--resources-week-view-group-label-width": "1.5rem",
              },
            })}
            styles={{
              // Replaced by the pinned WeekDayLabelStrip above (Mantine's own
              // labels center in each 1440px-wide day column, so they are
              // effectively invisible on a phone). The strip must sit directly
              // above the grid, so it lives outside the scroll area.
              resourcesWeekViewDayLabelsRow: { display: "none" },
              resourcesWeekViewResourceLabel: {
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                paddingInline: 0,
              },
            }}
            labels={{ resources: "" }}
            // Open at 07:00 like the Day view (startScrollPosition applies on
            // mount; week-to-week navigation keeps the current scroll position).
            // onScrollPositionChange feeds the pinned day-label strip.
            scrollAreaProps={weekScrollAreaProps}
            renderResourceLabel={renderResourceLabel}
            renderGroupLabel={renderGroupLabel}
          />
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
        size="sm"
        transitionProps={agendaTransitionProps}
      >
        {agendaViewDate && (
          <>
            <div
              ref={agendaSwipeRef}
              style={{
                touchAction: "pan-y",
                overflowY: "auto",
                maxHeight: "56dvh",
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

      <EventDetail
        event={detailEvent}
        onClose={() => setDetailEvent(null)}
        onEdit={(event, originRect) => {
          setDetailEvent(null);
          setFormMinimized(false);
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
        currentUserId={currentUser}
        isAdmin={isAdmin}
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
            aria-label="Restore event form"
            onClick={() => setFormMinimized(false)}
          >
            <IconChevronUp size={FAB_ICON_SIZE} />
          </FloatingActionButton>
          <ActionIcon
            radius="50%"
            w={FAB_SIZE}
            h={FAB_SIZE}
            variant="default"
            aria-label="Discard draft"
            onClick={closeForm}
          >
            <IconX size={FAB_ICON_SIZE} />
          </ActionIcon>
        </FloatingToolbar>
      )}

      <DateSelectorModal
        opened={pickerOpened}
        date={isAgenda ? headerDate : date}
        onPick={isAgenda ? applyAgendaDay : pickDate}
        onClose={closePicker}
      />

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
            aria-label="New event"
            // The Agenda tab prefills the day being viewed (like the day
            // modal's button); the other views keep "today".
            onClick={(e) =>
              openCreate(isAgenda ? headerDate : today, e.currentTarget.getBoundingClientRect())
            }
            disabled={!googleConfigured}
          >
            <IconPlus size={FAB_ICON_SIZE} />
          </FloatingActionButton>
        </FloatingToolbar>
      )}
    </Stack>
  );
}
