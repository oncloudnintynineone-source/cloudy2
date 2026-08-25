"use client";

import dayjs from "dayjs";
import {
  Suspense,
  type ReactNode,
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
  Stack,
  Tabs,
  Text,
  Tooltip,
  useMantineTheme,
} from "@mantine/core";
import { useDisclosure, useDrag, useMediaQuery } from "@mantine/hooks";
import {
  IconArrowsMaximize,
  IconArrowsMinimize,
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
  IconLink,
  IconPlus,
  IconRefresh,
  IconStar,
  IconStarFilled,
  IconUser,
  IconX,
} from "@tabler/icons-react";

import { formatWeekLabel } from "./clientDateTime";
import type { FilterGroup } from "@/components/FilterModal";
import {
  FAB_ICON_SIZE,
  FAB_SIZE,
  FloatingActionButton,
  FloatingToolbar,
} from "@/components/FloatingToolbar";
import { QuickLinksMenu, type QuickLinkMenuItem } from "@/components/QuickLinksMenu";
import { weekDays } from "@/lib/events/datetime";
import type { CalendarEvent } from "@/lib/events/queries";
import type { LocationPolicy } from "@/lib/events/locationPolicy";
import type { TimeOption } from "@/lib/events/timeOptions";
import { useMinSkeletonHold } from "@/lib/loading/minHoldLoading";
import {
  modalContentWidth,
  scaleFromRect,
  transformOriginFromRect,
  type Rect,
} from "@/lib/motion/origin";
import type { ScheduleUser } from "@/lib/events/schedule";
import { useImmersiveMode } from "@/lib/ui/immersiveMode";
import { DASHBOARD_STATE_KEYS, freshMarkerNeeded, orderDashboardViews } from "@/lib/ui/uiState";
import { usePersistUiState } from "@/lib/ui/uiStateClient";
import { EventsArea, ViewLoadingSkeleton } from "./EventsArea";
import {
  DateSelectorModalLazy,
  EventDetailLazy,
  EventFormLazy,
  FilterModalLazy,
  preloadDashboardModules,
} from "./lazy";

export type ViewMode = "month" | "week" | "weekv2" | "schedule" | "agenda";

// Tab bar labels/icons in default (unpinned) order; pinned tabs are moved to
// the front by `orderDashboardViews` (see the pinnedViews prop).
const VIEW_TAB_META: Record<ViewMode, { label: string; icon: ReactNode; nowrap?: boolean }> = {
  month: { label: "Month", icon: <IconCalendarMonth size={16} /> },
  week: { label: "Week", icon: <IconCalendarWeek size={16} /> },
  weekv2: { label: "Week v2", icon: <IconLayoutGrid size={16} />, nowrap: true },
  schedule: { label: "Day", icon: <IconCalendarUser size={16} /> },
  agenda: { label: "Agenda", icon: <IconListDetails size={16} /> },
};

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
  /**
   * Pinned tabs in recency order (index 0 = most recently pinned, renders
   * leftmost); unpinned tabs keep their default order. The server resolves
   * this from the remembered-state cookie on every render — including
   * `_fresh` renders, since pins are not URL-backed.
   */
  pinnedViews: string[];
  /**
   * Streamed from the page (deliberately unawaited there): this component
   * passes it straight to `EventsArea`, which resolves it with React's `use`
   * inside its Suspense boundary, so the chrome paints before the events
   * read lands.
   */
  events: Promise<CalendarEvent[]>;
  calendars: { id: string; name: string }[];
  eventTypes: EventTypeOption[];
  eventTitleTemplate: string;
  googleConfigured: boolean;
  /**
   * Enabled quick links in menu order (Settings → Quick Links); the amber
   * Quick-links launcher (mobile FAB / nav-row chip at lg) renders only when
   * at least one is set.
   */
  quickLinks: QuickLinkMenuItem[];
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
  filterUsers: { id: string; name: string; departmentName: string | null }[];
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

export function DashboardView({
  month,
  date,
  view,
  pinnedViews,
  events,
  calendars,
  eventTypes,
  eventTitleTemplate,
  googleConfigured,
  quickLinks,
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

  const theme = useMantineTheme();
  // Desktop = the theme's lg breakpoint: schedule label columns widen, the
  // week view's hour slots grow, modals get a wider size, and the "New event"
  // FAB moves into the nav row. The schedule views declare their label/slot
  // widths on the view root (inline var / styles-API var), so the override
  // lives here — a parent CSS class can't shadow the root's own declaration.
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);

  // Immersive ("fullscreen") mode is owned by the AppShell — it renders the
  // header / bottom nav / sidebar being hidden. We only control it here and
  // always exit on unmount, so navigating away from the calendar restores
  // the chrome (the shell's fullscreenchange listener covers Esc / the
  // Android status-bar edge gesture).
  const immersiveMode = useImmersiveMode();
  const exitImmersive = immersiveMode.exit;
  useEffect(() => {
    return () => exitImmersive();
  }, [exitImmersive]);

  // In immersive mode the hidden bottom nav frees its clearance: the floating
  // toolbars drop to the bare safe-area offset. Undefined keeps
  // FloatingToolbar's default var (the var lives on :root — the Affix
  // portals to <body>, outside any class scope).
  const fabBottomOffset = immersiveMode.active
    ? "var(--app-floating-bottom-offset-immersive)"
    : undefined;

  // Label-column widths for the schedule views: mobile-narrowed 48px/24px for
  // phones, comfortable 96px/56px on desktop.
  const scheduleLabelWidths = isDesktop
    ? { resource: "6rem", group: "3.5rem" }
    : { resource: "3rem", group: "1.5rem" };
  // The week view's 60px/hour slots are phone-tuned; 72px/hour gives event
  // banners desktop-readable width. The day view keeps Mantine's 80px default
  // (a 24h day is then exactly 1920px — a full desktop screen).
  const weekSlotWidth = isDesktop ? "calc(4.5rem * var(--mantine-scale))" : undefined;

  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
  // Where the tapped element sat on screen; the modal grows out of / shrinks
  // back into it (see src/lib/motion/origin.ts).
  const [detailOriginRect, setDetailOriginRect] = useState<Rect | null>(null);
  const [agendaOriginRect, setAgendaOriginRect] = useState<Rect | null>(null);
  const [formOriginRect, setFormOriginRect] = useState<Rect | null>(null);
  // Starts closed; a `?edit=` deep link opens it from EventsArea once the
  // streamed events resolve (one extra render vs the old sync initializer —
  // the form's grow-in animation hides it).
  const [formState, setFormState] = useState<FormState | null>(null);
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
  // Lazy chunks: modals render from first open onward (keeps the exit
  // animations intact — an outer unmount would cut them off) and the chunk
  // stays out of the initial bundle until then.
  const [detailEverOpened, setDetailEverOpened] = useState(false);
  const [filterEverOpened, setFilterEverOpened] = useState(false);
  const [pickerEverOpened, setPickerEverOpened] = useState(false);
  // Force-refresh window: set on click, cleared when EventsArea's streamed
  // events commit (the forced Google read can take a couple of seconds).
  const [forcePending, setForcePending] = useState(false);
  const [filterOpened, { open: openFilter, close: closeFilter }] = useDisclosure(false);
  const [pickerOpened, { open: openPicker, close: closePicker }] = useDisclosure(false);

  const clearForcePending = useCallback(() => setForcePending(false), []);
  const handleEditLinkResolved = useCallback((event: CalendarEvent) => {
    setFormState({ event, defaultDate: event.start.slice(0, 10) });
  }, []);
  const handleEventClick = useCallback((event: CalendarEvent, originRect: DOMRect) => {
    setDetailEverOpened(true);
    setDetailOriginRect(originRect);
    setDetailEvent(event);
  }, []);

  // Pinned tabs (index 0 = leftmost). The prop is the server's validated read
  // of the remembered-state cookie; local state leads it by one toggle. The
  // render-phase sync below (the standard "adjust state on prop change"
  // pattern) follows external prop changes — back/forward, a cleared cookie —
  // without clobbering a local toggle the cookie hasn't re-confirmed yet
  // (compared by content, not reference).
  const [pinned, setPinned] = useState<string[]>(pinnedViews);
  const [prevPinnedViews, setPrevPinnedViews] = useState<string[]>(pinnedViews);
  if (JSON.stringify(prevPinnedViews) !== JSON.stringify(pinnedViews)) {
    setPrevPinnedViews(pinnedViews);
    setPinned(pinnedViews);
  }

  // Optimistic date-nav chrome (`shown*`): leads the server-resolved props so
  // tab taps, chevrons and Today answer instantly while the grid waits behind
  // its skeleton for real data. Taps write these directly (shift*/switchView/
  // goToday/pickDate); the render-phase sync below follows external prop
  // changes (back/forward, deep links, remembered-state cold starts) and —
  // whenever our navigation transition has ended — re-snaps to the committed
  // props, healing a failed or offline navigation instead of stranding the
  // chrome on an intent that never landed. Same "adjust state during render"
  // pattern as `pinned` above.
  const [shownView, setShownView] = useState(view);
  const [shownMonth, setShownMonth] = useState(month);
  const [shownDate, setShownDate] = useState(date);
  const [prevNavSync, setPrevNavSync] = useState({ view, month, date, isPending });
  if (
    prevNavSync.view !== view ||
    prevNavSync.month !== month ||
    prevNavSync.date !== date ||
    prevNavSync.isPending !== isPending
  ) {
    setPrevNavSync({ view, month, date, isPending });
    // While our transition is in flight the optimistic values stand; once it
    // ends (commit or failure), whatever the server resolved wins.
    if (!isPending) {
      setShownView(view);
      setShownMonth(month);
      setShownDate(date);
    }
  }
  const shownIsAgenda = shownView === "agenda";
  const shownIsWeekV2 = shownView === "weekv2";
  const shownIsWeek = shownView === "week" || shownIsWeekV2;
  // Day-anchored chrome flag mirroring `isAnchoredView`, which stays bound to
  // the committed props because it drives data rendering below.
  const shownIsAnchored = shownView === "schedule" || shownIsWeekV2 || shownIsAgenda;

  // Height of the sticky chrome block (view tabs + date-nav row, one sticky
  // unit), so the Week v2 pinned day header and the Week day-label strip can
  // stick just below it. Measured before first paint (and on resize) so the
  // pinned headers never overlap the chrome.
  const tabsListRef = useRef<HTMLDivElement | null>(null);
  const [chromeHeight, setChromeHeight] = useState(0);
  useLayoutEffect(() => {
    const el = tabsListRef.current;
    if (!el) {
      return;
    }
    const update = () => setChromeHeight(el.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The tab bar scrolls horizontally on narrow screens. After a view change
  // (tab tap, `?view=` deep link, remembered-state cold start) bring the
  // active tab into view if it sits outside the visible strip; a direct tap
  // is already visible so this is a no-op there. `block: "nearest"` keeps the
  // scroll inside the strip instead of moving the page vertically.
  const tabListElRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const list = tabListElRef.current;
    if (!list) {
      return;
    }
    const active = list.querySelector<HTMLElement>('[data-active="true"]');
    if (!active) {
      return;
    }
    const listRect = list.getBoundingClientRect();
    const tabRect = active.getBoundingClientRect();
    if (tabRect.left < listRect.left || tabRect.right > listRect.right) {
      active.scrollIntoView({
        behavior:
          typeof window !== "undefined" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
        inline: "center",
        block: "nearest",
      });
    }
  }, [shownView]);

  // Week view: which day (0-6) sits at the left edge of the horizontally
  // scrolling grid. The index (not raw px) drives the pinned day-label strip,
  // so a scroll frame only re-renders when the visible day actually changes.
  const weekDayWidthRef = useRef(WEEK_DAY_WIDTH_PX);
  const [weekDayIndex, setWeekDayIndex] = useState(0);
  // Inner tracks of the pinned rulers follow horizontal scroll via direct DOM
  // transforms (see TimeRulerStrip); their cell width rides the --ruler-slot
  // var set on the content box by the measurement effect below. Viewport refs
  // sync the tracks on mount/load, when the views' start-scroll effects have
  // already positioned the grids.
  const weekRulerRef = useRef<HTMLDivElement | null>(null);
  const dayRulerRef = useRef<HTMLDivElement | null>(null);
  const weekViewportRef = useRef<HTMLDivElement | null>(null);
  const dayViewportRef = useRef<HTMLDivElement | null>(null);
  const handleWeekScroll = useCallback((pos: { x: number }) => {
    const index = Math.min(6, Math.max(0, Math.floor(pos.x / weekDayWidthRef.current)));
    setWeekDayIndex((prev) => (prev === index ? prev : index));
    if (weekRulerRef.current) {
      weekRulerRef.current.style.transform = `translateX(${-pos.x}px)`;
    }
  }, []);
  const handleDayScroll = useCallback((pos: { x: number }) => {
    if (dayRulerRef.current) {
      dayRulerRef.current.style.transform = `translateX(${-pos.x}px)`;
    }
  }, []);
  // Stable identity: the schedule views must not receive fresh
  // `scrollAreaProps` objects on every scroll frame.
  const weekScrollAreaProps = useMemo(
    () => ({
      viewportRef: weekViewportRef,
      onScrollPositionChange: handleWeekScroll,
    }),
    [handleWeekScroll],
  );
  const dayScrollAreaProps = useMemo(
    () => ({
      viewportRef: dayViewportRef,
      onScrollPositionChange: handleDayScroll,
    }),
    [handleDayScroll],
  );

  // Skeleton-only loading: any pending data navigation or force refresh
  // shows the grid skeleton. `useMinSkeletonHold` keeps it up for a minimum
  // ~350ms so fast (cached) loads read as a deliberate sequence instead of a
  // flash. `useContentEnter` (in EventsArea) fades the grid in on the reveal;
  // on a cold mount the class ships in the SSR HTML and plays on first paint.
  const gridLoading = useMinSkeletonHold(isPending || forcePending);

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
    pinnedViews: pinned,
  });

  const viewport = {
    w: typeof window === "undefined" ? 0 : window.innerWidth,
    h: typeof window === "undefined" ? 0 : window.innerHeight,
  };
  // The agenda-day and event-form modals widen sm (380px) -> md (440px) at lg,
  // so the shrink-to-target scale must use the matching content width.
  const contentWidth = modalContentWidth(viewport, isDesktop ? 440 : 380);
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

  // Nav-row labels derive from the optimistic `shown*` chrome so the period
  // text moves the instant a control is tapped. The grid/ruler branches below
  // guard on the committed `view` too, and whenever it renders (!gridLoading)
  // the sync above guarantees shown === committed, so these never feed stale
  // values into data rendering.
  const monthLabel = dayjs(`${shownMonth}-01`).format("MMMM YYYY");
  const dayLabel = dayjs(shownDate).format("ddd, MMM D, YYYY");
  const week = shownView === "week" || shownView === "weekv2" ? weekDays(shownDate) : null;
  const weekLabel = week ? formatWeekLabel(week[0], week[6]) : "";
  const today = dayjs().format("YYYY-MM-DD");
  const todayMonth = dayjs().format("YYYY-MM");

  const filterGroups: FilterGroup[] = useMemo(() => {
    const groups: FilterGroup[] = [
      { label: "Calendars", options: calendars.map((c) => ({ value: c.id, label: c.name })) },
    ];
    const userOptions = filterUsers.map((user) => ({
      value: user.id,
      label: user.name,
      // Carries the department into the picker dialog so users render as
      // per-department badge sections instead of one flat list.
      department: user.departmentName,
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

  const isWeekV2 = view === "weekv2";
  const isWeek = view === "week" || isWeekV2;
  const isSchedule = view === "schedule";
  const isAgenda = view === "agenda";
  // Day-anchored views (Day, Week v2, Agenda): a `?date=` anchor drives the
  // fetch (Week v2 shows the Monday-first week containing the anchor day).
  const isAnchoredView = isSchedule || isWeekV2 || isAgenda;

  // Tab bar order: pinned tabs first (in recency order), then the rest in
  // their default order. Re-validates the stored list (drops unknown values).
  const orderedViews = useMemo(() => orderDashboardViews(pinned), [pinned]);

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

  // Force refresh: a plain push of the one-shot nonce (no transition) — the
  // server renders that request with `force: true` and streams a fresh events
  // promise. Outside a transition the Suspense boundary falls back to the
  // grid skeleton while the forced Google read lands (a transition would hold
  // the old grid instead), and `forcePending` covers the same window for the
  // menu spinner + min-hold.
  function refreshNow() {
    setForcePending(true);
    router.push(buildHref({ refresh: String(Date.now()) }));
  }

  // Shifts compose on the optimistic chrome values (not the committed props),
  // so rapid taps during a pending navigation accumulate instead of being
  // eaten by navigate()'s no-op guard.
  function shiftMonth(delta: number) {
    const next = dayjs(`${shownMonth}-01`).add(delta, "month").format("YYYY-MM");
    setShownMonth(next);
    navigate({ month: next });
  }

  function shiftDay(delta: number) {
    const next = dayjs(shownDate).add(delta, "day");
    setShownDate(next.format("YYYY-MM-DD"));
    setShownMonth(next.format("YYYY-MM"));
    navigate({ date: next.format("YYYY-MM-DD"), month: next.format("YYYY-MM") });
  }

  function shiftWeek(delta: number) {
    const next = dayjs(shownDate).add(delta, "week");
    setShownDate(next.format("YYYY-MM-DD"));
    setShownMonth(next.format("YYYY-MM"));
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
      // month is derived from the date by the page. The chrome flips now —
      // tab highlight and period label answer before the fetch resolves.
      setShownView(mode);
      setShownDate(today);
      setShownMonth(todayMonth);
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
    // Anchoring reads the optimistic chrome so leaving mid-flight (tap Week,
    // then Month before commit) still lands on the month you were shown.
    const anchorMonth = shownIsWeek || shownIsAnchored ? shownDate.slice(0, 7) : null;
    setShownView("month");
    navigate({
      view: null,
      month: anchorMonth,
      date: null,
    });
  }

  function goToday() {
    if (isAgenda) {
      applyAgendaDay(today);
      return;
    }
    if (isAnchoredView) {
      setShownDate(today);
      setShownMonth(todayMonth);
      navigate({ date: today, month: todayMonth });
    } else {
      setShownMonth(todayMonth);
      navigate({ month: todayMonth });
    }
  }

  function pickDate(picked: string) {
    setShownDate(picked);
    setShownMonth(picked.slice(0, 7));
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

  function togglePinView() {
    // Pinning moves the active tab to the front (last pinned = leftmost);
    // unpinning drops it back into the default tab order. Pure display order —
    // no navigation, so no skeleton and no `_fresh` marker.
    setPinned(pinned.includes(view) ? pinned.filter((mode) => mode !== view) : [view, ...pinned]);
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

  // "Today" affordance state, keyed to the optimistic chrome like the label:
  // the menu item reflects where you're headed, not where the fetch is at.
  const onToday = shownIsWeek
    ? week !== null && week.some((day) => day === today)
    : shownIsAnchored
      ? headerDate === today
      : shownMonth === todayMonth;

  // Warm the lazy dashboard modules (the five views + the modals) after first
  // paint, so a later tab switch or modal tap never waits on a chunk. The
  // active view's chunk is already primed at render time by EventsArea.
  useEffect(() => {
    if (typeof window.requestIdleCallback === "function") {
      const idle = window.requestIdleCallback(() => preloadDashboardModules(), {
        timeout: 5000,
      });
      return () => window.cancelIdleCallback(idle);
    }
    const timer = window.setTimeout(() => preloadDashboardModules(), 1500);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    // Pulled up by the shell's md padding: AppShell.Main adds
    // --app-shell-padding ON TOP of the 56px header offset, which showed as a
    // body-background strip under the fixed header until the sticky chrome
    // scrolled up to pin flush. Negative margin starts the chrome at the
    // header's bottom edge (its sticky `top`), so rest and pinned states match.
    <Stack pb="xl" gap="sm" style={{ marginTop: "calc(-1 * var(--app-shell-padding))" }}>
      {/* The sticky chrome block: view tabs + date-nav row pinned as one unit
          at every breakpoint. The wrapper is a direct child of the Stack, so
          its containing block spans the whole page and sticky can hold it at
          the top (a sticky element pinned to a shorter root would scroll away
          with it); page content slides beneath its opaque background. Its
          measured height feeds the Week v2 day header and the Week label
          strip so they dock flush beneath it. */}
      <Box
        ref={tabsListRef}
        style={{
          position: "sticky",
          top: "var(--app-shell-header-offset)",
          // Above everything the schedule views stack internally (their
          // sticky-left columns and scrollbars reach z-index 20) so grid
          // content sliding beneath never paints over the pinned chrome.
          zIndex: 50,
          background: "var(--mantine-color-body)",
          // Immersive pins the chrome at the viewport top. Where the
          // Fullscreen API is unsupported (iOS) the OS status bar is still
          // up — keep the tabs clear of it (0 elsewhere).
          paddingTop: immersiveMode.active ? "env(safe-area-inset-top)" : undefined,
          paddingBottom: "var(--mantine-spacing-xs)",
          // Marks the chrome's bottom edge while content scrolls beneath it
          // (the tabs list's own border now sits mid-block, above the nav).
          borderBottom: "1px solid var(--mantine-color-default-border)",
        }}
      >
        <Tabs
          value={shownView}
          onChange={(next) => switchView(next ?? "month")}
          aria-label="Calendar view"
          styles={{ tab: { flex: 1 } }}
        >
          <Tabs.List
            ref={tabListElRef}
            style={{
              flexWrap: "nowrap",
              overflowX: "auto",
              borderBottom: "1px solid var(--mantine-color-default-border)",
            }}
          >
            {orderedViews.map((mode) => {
              const meta = VIEW_TAB_META[mode];
              return (
                <Tabs.Tab key={mode} value={mode}>
                  <Group gap="xs" justify="center" wrap="nowrap">
                    {meta.icon}
                    {pinned.includes(mode) && <IconStarFilled size={14} />}
                    <Text
                      fw={600}
                      size="sm"
                      style={meta.nowrap ? { whiteSpace: "nowrap" } : undefined}
                    >
                      {meta.label}
                    </Text>
                  </Group>
                </Tabs.Tab>
              );
            })}
          </Tabs.List>
        </Tabs>

        {/* Date navigation: pinned together with the tabs above so the period
            label and prev/next stay reachable while the grid scrolls. Kept
            compact (36px controls) — it is part of the permanently visible
            chrome on every breakpoint. */}
        <Group align="center" gap="xs" wrap="nowrap" mt="xs">
          <ActionIcon
            size={36}
            variant="default"
            aria-label={
              shownIsWeek ? "Previous week" : shownIsAnchored ? "Previous day" : "Previous month"
            }
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
            size="md"
            lineClamp={1}
            style={{ flex: 1, minWidth: 0, textAlign: "center" }}
          >
            {/* Label flavor follows the optimistic chrome (same contract as
                the skeleton below): the period you asked for is what reads,
                even while its data is still in flight. The Agenda branch
                still tracks `viewedDay` once the tab is live — a fresh entry
                has none, so it falls back to the optimistic date (today). */}
            {shownIsAgenda
              ? dayjs(viewedDay ?? shownDate).format("ddd, MMM D, YYYY")
              : shownIsWeek
                ? weekLabel
                : shownIsAnchored
                  ? dayLabel
                  : monthLabel}
          </Text>
          <ActionIcon
            size={36}
            variant="default"
            aria-label={shownIsWeek ? "Next week" : shownIsAnchored ? "Next day" : "Next month"}
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
          {/* Immersive ("fullscreen") toggle: hides the shell chrome (header,
              bottom nav, desktop sidebar) and requests the page-level
              Fullscreen API so the status bar / browser UI go too. The icon
              flips while active — this is the in-page exit path. */}
          <Tooltip label={immersiveMode.active ? "Exit fullscreen" : "Fullscreen"}>
            <ActionIcon
              size={36}
              variant="default"
              aria-label={immersiveMode.active ? "Exit fullscreen" : "Enter fullscreen"}
              aria-pressed={immersiveMode.active}
              onClick={immersiveMode.active ? immersiveMode.exit : immersiveMode.enter}
            >
              {immersiveMode.active ? (
                <IconArrowsMinimize size={18} />
              ) : (
                <IconArrowsMaximize size={18} />
              )}
            </ActionIcon>
          </Tooltip>
          {/* Desktop: the "New event" FAB lives in the nav row instead of the
            bottom corner (the FAB is hidden at lg, below). */}
          <Button
            visibleFrom="lg"
            __vars={{ "--button-height": "36px" }}
            leftSection={<IconPlus size={16} />}
            disabled={!googleConfigured}
            onClick={(e) =>
              openCreate(isAgenda ? headerDate : today, e.currentTarget.getBoundingClientRect())
            }
          >
            New event
          </Button>
          {/* The same quick-links menu, launched from the nav row at lg (the
              mobile FAB is hidden there). Amber + labelled on purpose: it must
              never be confused with the grey "More options" kebab next door. */}
          {quickLinks.length > 0 && (
            <QuickLinksMenu
              links={quickLinks}
              position="bottom-end"
              trigger={
                <Button
                  visibleFrom="lg"
                  variant="light"
                  color="accent"
                  __vars={{ "--button-height": "36px" }}
                  leftSection={<IconLink size={16} />}
                  aria-label="Quick links"
                >
                  Quick links
                </Button>
              }
            />
          )}
          <Menu
            shadow="md"
            width={200}
            position="bottom-end"
            transitionProps={{ transition: "pop-top-right", duration: 150, timingFunction: "ease" }}
          >
            <Menu.Target>
              <Box pos="relative">
                <ActionIcon size={36} variant="default" aria-label="More options">
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
                <Menu.Item
                  leftSection={<IconCalendarDot size={16} />}
                  onClick={() => {
                    setPickerEverOpened(true);
                    openPicker();
                  }}
                >
                  Select date
                </Menu.Item>
              )}
              <Menu.Item
                leftSection={
                  pinned.includes(view) ? <IconStarFilled size={16} /> : <IconStar size={16} />
                }
                onClick={togglePinView}
              >
                {pinned.includes(view) ? "Unpin Tab" : "Pin Tab"}
              </Menu.Item>
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
                onClick={() => {
                  setFilterEverOpened(true);
                  openFilter();
                }}
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
                  forcePending ? <Loader size="sm" color="gray" /> : <IconRefresh size={16} />
                }
                disabled={!googleConfigured || forcePending}
                onClick={refreshNow}
              >
                Force refresh
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Box>

      {!googleConfigured && (
        <Alert color="yellow" title="Google Calendar is not configured">
          Events cannot be created or edited until Google service-account credentials are set.
        </Alert>
      )}

      {/* The data area streams in: the page hands over an unawaited events
          promise and EventsArea resolves it inside this Suspense boundary, so
          the chrome above paints before the (possibly Google-bound) read
          lands. During transitions the committed grid is held until the new
          promise resolves; a force refresh (plain push, no transition) falls
          back to the skeleton below for the whole fetch. */}
      <Suspense fallback={<ViewLoadingSkeleton shownView={shownView} shownMonth={shownMonth} />}>
        <EventsArea
          events={events}
          initialEditEventId={initialEditEventId}
          onEditLinkResolved={handleEditLinkResolved}
          onEventsResolved={clearForcePending}
          view={view}
          shownView={shownView}
          shownMonth={shownMonth}
          month={month}
          date={date}
          week={week}
          gridLoading={gridLoading}
          isDesktop={isDesktop}
          googleConfigured={googleConfigured}
          chromeHeight={chromeHeight}
          scheduleLabelWidths={scheduleLabelWidths}
          weekSlotWidth={weekSlotWidth}
          today={today}
          calendars={calendars}
          selectedCalendarIds={selectedCalendarIds}
          scheduleUsers={scheduleUsers}
          allActiveUsers={allActiveUsers}
          selectedUserIds={selectedUserIds}
          weekDayIndex={weekDayIndex}
          weekDayWidthRef={weekDayWidthRef}
          weekRulerRef={weekRulerRef}
          dayRulerRef={dayRulerRef}
          weekViewportRef={weekViewportRef}
          dayViewportRef={dayViewportRef}
          weekScrollAreaProps={weekScrollAreaProps}
          dayScrollAreaProps={dayScrollAreaProps}
          agendaDate={agendaDate}
          setAgendaDate={setAgendaDate}
          setAgendaSlideDir={setAgendaSlideDir}
          agendaSlideDir={agendaSlideDir}
          setAgendaOriginRect={setAgendaOriginRect}
          agendaTransitionProps={agendaTransitionProps}
          agendaSwipeRef={agendaSwipeRef}
          agendaTabSwipeRef={agendaTabSwipeRef}
          swipedRef={swipedRef}
          headerDate={headerDate}
          shiftAgendaDay={shiftAgendaDay}
          onEventClick={handleEventClick}
          openCreate={openCreate}
        />
      </Suspense>

      {detailEverOpened && (
        <EventDetailLazy
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
      )}

      <Modal.Root
        opened={formState !== null && !formMinimized}
        onClose={closeForm}
        keepMounted
        centered
        size={isDesktop ? "md" : "sm"}
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
              <EventFormLazy
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
        <FloatingToolbar zIndex={300} bottomOffset={fabBottomOffset}>
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

      {pickerEverOpened && (
        <DateSelectorModalLazy
          opened={pickerOpened}
          date={isAgenda ? headerDate : date}
          onPick={isAgenda ? applyAgendaDay : pickDate}
          onClose={closePicker}
        />
      )}

      {filterEverOpened && (
        <FilterModalLazy
          opened={filterOpened}
          onClose={closeFilter}
          title="Filters"
          groups={filterGroups}
          values={filterValues}
          onApply={handleApplyFilters}
        />
      )}

      {formState === null && (
        // Mobile-only: at lg the "New event" button in the nav row replaces the
        // FAB. hiddenFrom sits on the toolbar itself: its Affix portals to
        // <body>, so a wrapper element could not hide it.
        <FloatingToolbar hiddenFrom="lg" bottomOffset={fabBottomOffset}>
          {/* The amber Quick-links FAB opens the quick-links menu (Settings →
              Quick Links); it renders only when at least one link is enabled.
              Amber + link icon on purpose: it must never be confused with the
              grey "More options" kebab in the nav row. */}
          {quickLinks.length > 0 && (
            <QuickLinksMenu
              links={quickLinks}
              position="top-end"
              trigger={
                <FloatingActionButton variant="light" color="accent" aria-label="Quick links">
                  <IconLink size={FAB_ICON_SIZE} />
                </FloatingActionButton>
              }
            />
          )}
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
