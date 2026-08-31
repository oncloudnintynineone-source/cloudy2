"use client";

import dayjs from "dayjs";
import {
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type RefObject,
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
  Portal,
  Stack,
  Tabs,
  Text,
  Tooltip,
  UnstyledButton,
  useMantineTheme,
} from "@mantine/core";
import { useDisclosure, useDrag, useMediaQuery, useMergedRef } from "@mantine/hooks";
import {
  AgendaView,
  MonthView,
  ResourcesDayView,
  ResourcesWeekView,
  type ScheduleResourceData,
  type ScheduleResourceGroup,
} from "@mantine/schedule";
import {
  IconArrowsMaximize,
  IconArrowsMinimize,
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
  IconLink,
  IconPlus,
  IconRefresh,
  IconStar,
  IconStarFilled,
  IconUser,
  IconUserOff,
  IconX,
} from "@tabler/icons-react";

import {
  AgendaListSkeleton,
  MonthGridSkeleton,
  ScheduleGridSkeleton,
  WeekGridSkeleton,
  WeekMatrixSkeleton,
  monthGridRows,
} from "./calendarSkeleton";
import { formatWeekLabel } from "./clientDateTime";
import { DateSelectorModal } from "@/components/DateSelectorModal";
import { EmptyState } from "@/components/EmptyState";
import { FilterModal, type FilterGroup } from "@/components/FilterModal";
import { GridNavControls } from "@/components/GridNavControls";
import {
  FAB_ICON_SIZE,
  FAB_SIZE,
  FloatingActionButton,
  FloatingToolbar,
} from "@/components/FloatingToolbar";
import { LoadingStatus } from "@/components/LoadingStatus";
import { QuickLinksMenu, type QuickLinkMenuItem } from "@/components/QuickLinksMenu";
import { eventsOnDay } from "@/lib/events/agenda";
import { WEEKDAY_ABBREVIATIONS, weekDays } from "@/lib/events/datetime";
import { sortMineFirst } from "@/lib/events/mineFirst";
import type { CalendarEvent } from "@/lib/events/queries";
import type { LocationCategory } from "@/lib/events/locationPolicy";
import type { TimeOption } from "@/lib/events/timeOptions";
import { eventMatchesUserFilter } from "@/lib/events/userFilter";
import { CONTENT_ENTER_CLASS, useContentEnter } from "@/lib/loading/contentEnter";
import { useMinSkeletonHold } from "@/lib/loading/minHoldLoading";
import {
  modalContentWidth,
  scaleFromRect,
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
import { announce } from "@/lib/ui/announcer";
import { useGridPan } from "@/lib/ui/gridPan";
import { useImmersiveMode } from "@/lib/ui/immersiveMode";
import {
  daySlotWidth,
  reanchorScrollLeft,
  stepZoom,
  weekSlotWidth,
  type SlotZoom,
} from "@/lib/ui/slotZoom";
import { DASHBOARD_STATE_KEYS, freshMarkerNeeded, orderDashboardViews } from "@/lib/ui/uiState";
import { usePersistUiState } from "@/lib/ui/uiStateClient";
import { PINNED_EVENTS_CHANGED_EVENT } from "@/lib/ui/pinnedPanel";
import { EventDetail } from "./EventDetail";
import { EventForm } from "./EventForm";
import { WeekMatrixView } from "./WeekMatrixView";
import { invalidateCurrentPathCaches } from "@/lib/pwa/client";

type ViewMode = "month" | "week" | "weekv2" | "schedule" | "agenda";

/**
 * Mantine's `RenderEvent` signature (the type itself is not re-exported from
 * the package root) — the Month/Agenda `renderEvent` prop contract.
 */
type MyEventRender = (
  event: { id: string | number },
  props: ComponentPropsWithoutRef<"button"> & { children: ReactNode },
) => ReactElement;

// Initial "saved at" timestamp for the data-freshness label: prefer the SW's
// injected document stamp (when the HTML shell was served from the SW cache,
// its cachedAt is the most truthful data timestamp), else fall back to the
// mount time.
function initialSavedAt(): number {
  if (typeof window === "undefined") return Date.now();
  const w = window as unknown as { __C2_STAMP__?: { cachedAt: string } };
  const s = w.__C2_STAMP__;
  if (s && typeof s.cachedAt === "string") {
    const d = new Date(s.cachedAt);
    if (!Number.isNaN(d.getTime())) return d.getTime();
  }
  return Date.now();
}

// Tab bar labels/icons in default (unpinned) order; pinned tabs are moved to
// the front by `orderDashboardViews` (see the pinnedViews prop).
const VIEW_TAB_META: Record<ViewMode, { label: string; icon: ReactNode; nowrap?: boolean }> = {
  month: { label: "Month", icon: <IconCalendarMonth size={16} /> },
  week: { label: "Week (H)", icon: <IconCalendarWeek size={16} /> },
  weekv2: { label: "Week (D)", icon: <IconLayoutGrid size={16} />, nowrap: true },
  schedule: { label: "Day", icon: <IconCalendarUser size={16} /> },
  agenda: { label: "Agenda", icon: <IconListDetails size={16} /> },
};

interface EventTypeOption {
  name: string;
  shortname: string | null;
  timeOptions: TimeOption[];
  allowedLocations: LocationCategory[];
  showRemarks: boolean;
  showInvitees: boolean;
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
   * Remembered Day/Week (H) hour-slot zoom level, resolved from the UI-state
   * cookie before first paint (a relaunch restores the last zoom with no
   * width jump). Seeding value for the client zoom state only.
   */
  initialZoom: SlotZoom;
  events: CalendarEvent[];
  calendars: { id: string; name: string; sortOrder: number }[];
  eventTypes: EventTypeOption[];
  eventTitleTemplate: string;
  viewEventTitleTemplate: string;
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
  /**
   * Event group id from the `?event=` deep link (the Pinned Events agenda's
   * tap-to-open); the event's details modal opens automatically once the
   * fetched events include a copy of the group.
   */
  initialDetailEventId: string | null;
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
  currentUserName: string;
}

interface FormState {
  event: CalendarEvent | null;
  /** When set (and `event` is null), the form pre-fills from this source event
      in create mode — the "duplicate" flow. */
  templateEvent: CalendarEvent | null;
  defaultDate: string;
}

const DAY_SWIPE_THRESHOLD = 48;

/**
 * Day-label strip for the Week (H) view. `ResourcesWeekView`'s own day labels are
 * centered in each full-width day column, so on a phone they are only visible
 * when the viewport happens to sit over the middle of a day. This strip
 * replaces that row and pins all 7 date labels beneath the shared chrome; its
 * inner track translates by -scrollLeft via a direct DOM transform (no
 * re-renders), so the labels stay over their day columns while the grid pans
 * horizontally — mirroring the TimeRulerStrip below — instead of a single label
 * being swapped on a day boundary (which leaves only one of two side-by-side
 * dates visible). The strip itself is sticky under the shared tabs+date-nav
 * chrome at every breakpoint, mirroring
 * the Week (D) day header.
 */
function WeekDayLabelStrip({
  days,
  hasGroups,
  resourceLabelWidth,
  groupLabelWidth,
  chromeOffset,
  innerRef,
}: {
  days: string[];
  hasGroups: boolean;
  resourceLabelWidth: string;
  groupLabelWidth: string;
  /** Height of the sticky tabs+date-nav chrome this strip docks below. */
  chromeOffset: number;
  /** The inner day track; synced to the grid's scroll via a direct transform. */
  innerRef: RefObject<HTMLDivElement | null>;
}) {
  // The width of the sticky corner/label columns the grid scrolls beneath,
  // matching the ResourcesWeekView sizing overrides on the view itself.
  // +1px accounts for the grid root's left border so the day track aligns
  // with the grid's first day column.
  const leftWidth = hasGroups
    ? `calc(${groupLabelWidth} + ${resourceLabelWidth} + 1px)`
    : `calc(${resourceLabelWidth} + 1px)`;
  return (
    <Box
      component="div"
      style={{
        position: "sticky",
        top: `calc(var(--app-shell-header-offset) + ${chromeOffset}px)`,
        zIndex: 45,
        display: "flex",
        overflow: "hidden",
        height: "calc(2rem * var(--mantine-scale))",
        background: "var(--mantine-color-body)",
        borderBottom: "1px solid var(--mantine-color-default-border)",
      }}
    >
      {/* Continues the corner's vertical divider across the strip's band. */}
      <Box
        component="div"
        style={{
          flexShrink: 0,
          width: leftWidth,
          borderRight: "1px solid var(--mantine-color-default-border)",
        }}
      />
      <Box component="div" style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
        {/* One cell per day — the track is exactly as wide as the grid's 7-day
            content (each day = 24 slots), so translating it by -scrollLeft
            keeps every label over its day column during a horizontal pan. */}
        <Box
          ref={innerRef}
          component="div"
          style={{
            display: "flex",
            width: `calc(var(--ruler-slot, 60px) * ${SLOTS_PER_DAY * days.length})`,
            willChange: "transform",
          }}
        >
          {days.map((day) => {
            const dayObj = dayjs(day);
            const isToday = dayObj.isSame(dayjs(), "day");
            const isWeekend = dayObj.day() === 0 || dayObj.day() === 6;
            return (
              <Box
                key={day}
                component="div"
                style={{
                  width: `calc(var(--ruler-slot, 60px) * ${SLOTS_PER_DAY})`,
                  flexShrink: 0,
                  borderLeft: "1px solid var(--mantine-color-default-border)",
                  display: "flex",
                  alignItems: "center",
                  paddingInline: "0.5rem",
                }}
              >
                <Text
                  size="sm"
                  style={{
                    lineHeight: 1.2,
                    whiteSpace: "nowrap",
                    textTransform: "capitalize",
                    userSelect: "none",
                    fontWeight: isToday
                      ? "var(--mantine-font-weight-bold)"
                      : "var(--mantine-font-weight-medium)",
                    background: isToday ? "var(--mantine-primary-color-filled)" : "transparent",
                    color: isToday
                      ? "var(--mantine-primary-color-contrast)"
                      : isWeekend
                        ? "var(--mantine-color-red-6)"
                        : undefined,
                  }}
                >
                  {dayObj.format("ddd D")}
                </Text>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}

/** Hourly slots per day in the schedule views (00:00–23:59 @ 60min). */
const SLOTS_PER_DAY = 24;

/**
 * Pinned hour ruler for the Day and Week (H) schedule views. The library's own
 * time-labels row is sticky only inside its ScrollArea viewport, which never
 * scrolls vertically (the page does), so during page scroll the axis scrolls
 * away with the grid. This strip replaces that row: it pins beneath the shared
 * chrome (like the Week (H) day-label strip) and its inner hour track translates
 * by -scrollLeft via a direct DOM transform — no re-renders — so labels stay
 * over their columns while the grid pans horizontally, mirroring the Week (D)
 * day-header mechanics.
 */
function TimeRulerStrip({
  hasGroups,
  resourceLabelWidth,
  groupLabelWidth,
  chromeOffset,
  /** Extra sticky offset when another strip stacks above this one. */
  stackBelowHeight,
  innerRef,
  /** Number of days the ruler spans (1 for Day view, 7 for Week (H) view). */
  days = 1,
}: {
  hasGroups: boolean;
  resourceLabelWidth: string;
  groupLabelWidth: string;
  chromeOffset: number;
  stackBelowHeight?: string;
  innerRef: RefObject<HTMLDivElement | null>;
  days?: number;
}) {
  // The width of the sticky corner/label columns the grid scrolls beneath,
  // matching the ResourcesWeekView/ResourcesDayView sizing overrides.
  // +1px accounts for the grid root's left border so the ruler aligns with
  // the grid's slot columns.
  const leftWidth = hasGroups
    ? `calc(${groupLabelWidth} + ${resourceLabelWidth} + 1px)`
    : `calc(${resourceLabelWidth} + 1px)`;
  const totalSlots = SLOTS_PER_DAY * days;
  return (
    <Box
      component="div"
      aria-hidden
      style={{
        position: "sticky",
        top: stackBelowHeight
          ? `calc(var(--app-shell-header-offset) + ${chromeOffset}px + ${stackBelowHeight})`
          : `calc(var(--app-shell-header-offset) + ${chromeOffset}px)`,
        zIndex: 45,
        display: "flex",
        overflow: "hidden",
        background: "var(--mantine-color-body)",
        borderBottom: "1px solid var(--mantine-color-default-border)",
      }}
    >
      <Box
        component="div"
        aria-hidden
        style={{
          flexShrink: 0,
          width: leftWidth,
          // Continues the corner's vertical divider across the ruler band.
          borderRight: "1px solid var(--mantine-color-default-border)",
        }}
      />
      <Box component="div" aria-hidden style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
        <Box
          ref={innerRef}
          component="div"
          style={{
            display: "flex",
            width: `calc(var(--ruler-slot, 60px) * ${totalSlots})`,
            willChange: "transform",
          }}
        >
          {Array.from({ length: totalSlots }, (_, slot) => (
            <Box
              key={slot}
              component="div"
              style={{
                width: "var(--ruler-slot, 60px)",
                flexShrink: 0,
                borderLeft: "1px solid var(--mantine-color-default-border)",
                padding: "2px 0 2px 4px",
              }}
            >
              <Text
                size="xs"
                c="dimmed"
                style={{ lineHeight: 1.2, userSelect: "none", whiteSpace: "nowrap" }}
              >
                {String(slot % SLOTS_PER_DAY).padStart(2, "0")}
              </Text>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

/**
 * Resolves a CSS `width` value against `root` by appending a temporary block
 * probe and reading its offsetWidth (the same technique the ruler effect uses
 * to measure the schedule slot width). Used to measure realized px widths for
 * the timeline re-anchor and the month weekday strip.
 */
function measuredWidth(root: Element, cssWidth: string): number {
  const probe = document.createElement("span");
  probe.style.display = "block";
  probe.style.width = cssWidth;
  root.append(probe);
  const width = probe.offsetWidth;
  root.removeChild(probe);
  return width;
}

// `@mantine/schedule`'s MonthView day/header cells enforce a minimum column
// width of 5.25rem (84px) at scale 1 (`--min-day-width`), so seven columns need
// at least 588px. The pinned strip below must reproduce that geometry so its
// weekday initials stay over the day columns when the grid scrolls horizontally.
const MONTH_MIN_DAY_WIDTH_PX = 84;
const MONTH_COLUMNS = 7;

/**
 * Pinned weekday-initials strip for the Month view. Mantine's own weekday row
 * lives inside the Month view's content-height ScrollArea and scrolls away with
 * the page, so this strip replaces it (`withWeekDays={false}` on the MonthView).
 * It pins beneath the shared chrome like the Week (H) day-label strip, and its
 * inner 7-column track translates by -scrollLeft (driven by the MonthScrollArea's
 * `onScrollPositionChange`) so the initials track the columns on the narrow
 * screens where the 588px-wide grid scrolls horizontally.
 */
function MonthWeekdayStrip({
  chromeOffset,
  innerRef,
}: {
  chromeOffset: number;
  innerRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <Box
      component="div"
      style={{
        position: "sticky",
        top: `calc(var(--app-shell-header-offset) + ${chromeOffset}px)`,
        zIndex: 45,
        height: "calc(2.25rem * var(--mantine-scale))",
        background: "var(--mantine-color-body)",
        borderBottom: "1px solid var(--mantine-color-default-border)",
        overflow: "hidden",
      }}
    >
      <Box
        ref={innerRef}
        component="div"
        style={{
          display: "flex",
          width: "100%",
          // Mirrors the Month view's per-row min-width (7 × column width), so
          // the track is exactly as wide as the scrollable grid content.
          minWidth: `calc(${MONTH_MIN_DAY_WIDTH_PX}px * ${MONTH_COLUMNS})`,
          willChange: "transform",
        }}
      >
        {WEEKDAY_ABBREVIATIONS.map((day, index) => (
          <Box
            key={day}
            component="div"
            style={{
              flex: `0 0 calc(100% / ${MONTH_COLUMNS})`,
              minWidth: `${MONTH_MIN_DAY_WIDTH_PX}px`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "var(--mantine-font-size-sm)",
              fontWeight: "var(--mantine-font-weight-medium)",
              textTransform: "capitalize",
              color: "var(--mantine-color-dimmed)",
              borderLeft: index === 0 ? undefined : "1px solid var(--mantine-color-default-border)",
              userSelect: "none",
            }}
          >
            {day}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export function DashboardView({
  month,
  date,
  view,
  pinnedViews,
  initialZoom,
  events,
  calendars,
  eventTypes,
  eventTitleTemplate,
  viewEventTitleTemplate,
  googleConfigured,
  quickLinks,
  selectedCalendarIds,
  selectedTypes,
  selectedUserIds,
  currentUser,
  isAdmin,
  initialEditEventId,
  initialDetailEventId,
  scheduleUsers,
  allActiveUsers,
  inviteeDepartments,
  inviteeUsers,
  filterUsers,
  peopleNames,
  calendarNames,
  currentUserName,
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

  // Timeline zoom (Day/Week (H) hour-slot width). Purely client-owned, seeded
  // once from the remembered cookie; `usePersistUiState` below writes every
  // change back so a relaunch restores it. No render-phase sync: the user's
  // latest tap always wins, and the cookie (hence the next server seed) has
  // already converged to it.
  const [zoom, setZoom] = useState<SlotZoom>(initialZoom);
  // Tracks the previous zoom so the consolidated geometry effect (below) only
  // re-anchors the scroll on a genuine zoom change — never on mount, view
  // switches or breakpoint flips.
  const prevZoomRef = useRef(zoom);

  // Label-column widths for the schedule views: mobile-narrowed 48px/24px for
  // phones, comfortable 96px/56px on desktop.
  const scheduleLabelWidths = isDesktop
    ? { resource: "6rem", group: "3.5rem" }
    : { resource: "3rem", group: "1.5rem" };
  // Hour-slot (column) width for the schedule views, driven by the shared
  // timeline zoom: Week (H) slots are 60px phone-tuned / 72px at lg, the Day
  // view keeps Mantine's 80px — each multiplied by the zoom level (1 = these
  // defaults). See src/lib/ui/slotZoom.ts and GridNavControls.
  const weekSlotWidthValue = weekSlotWidth(zoom, isDesktop);
  const daySlotWidthValue = daySlotWidth(zoom);

  // The `?edit=` deep link (from a Google Calendar "Edit:" note) resolves its
  // target event synchronously at mount — the server has already fetched the
  // month — so the edit form/banner initialize without a follow-up render.
  const initialEditEvent = initialEditEventId
    ? (events.find((event) => event.payload.eventId === initialEditEventId) ?? null)
    : null;

  const initialDetailEvent = initialDetailEventId
    ? (events.find((event) => event.payload.eventId === initialDetailEventId) ?? null)
    : null;

  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(initialDetailEvent);
  // Where the tapped element sat on screen; the modal grows out of / shrinks
  // back into it (see src/lib/motion/origin.ts).
  const [detailOriginRect, setDetailOriginRect] = useState<Rect | null>(null);
  const [agendaOriginRect, setAgendaOriginRect] = useState<Rect | null>(null);
  const [formOriginRect, setFormOriginRect] = useState<Rect | null>(null);
  const [formState, setFormState] = useState<FormState | null>(() =>
    initialEditEvent
      ? {
          event: initialEditEvent,
          templateEvent: null,
          defaultDate: initialEditEvent.start.slice(0, 10),
        }
      : null,
  );
  // Facebook-bubble minimize: the form modal collapses into a floating circle
  // while `formMinimized` is true. The modal stays mounted (`keepMounted`) so
  // the draft survives.
  const [formMinimized, setFormMinimized] = useState(false);
  // The "Tap outside to minimize" caption floats *below* the dialog box,
  // outside of it, so its position is measured rather than styled in: the
  // dialog Paper's offsetParent is the modal's fixed full-viewport inner
  // layer, which makes offsetTop/offsetLeft viewport coordinates directly.
  // They're layout coordinates, so they stay stable during the modal's
  // transform-only open/close animation (getBoundingClientRect would return
  // the mid-scale box while the animation runs).
  // Callback ref for Modal.Content — useState so the measurement effect
  // re-runs when React calls the ref callback.  Mantine v9.5.1 wraps the
  // modal body in <Activity mode="hidden"> when keepMounted (the default);
  // during the Activity transition the DOM node is detached and the ref
  // fires with null.  A plain useRef wouldn't trigger a re-measure when
  // Activity switches to visible, so we track the element in state.
  const [contentEl, setContentEl] = useState<HTMLDivElement | null>(null);
  const [hintPosition, setHintPosition] = useState<{
    bottom: number;
    left: number;
    width: number;
  } | null>(null);
  const formIsOpen = formState !== null;

  useEffect(() => {
    const el = contentEl;
    if (!el) return;
    const update = () => {
      if (el.offsetParent === null) {
        // Paper is Activity-hidden (modal fully closed) — hide the caption.
        setHintPosition(null);
        return;
      }
      setHintPosition({
        bottom: el.offsetTop + el.offsetHeight,
        left: el.offsetLeft,
        width: el.offsetWidth,
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    // Viewport resizes (soft keyboard, rotation) re-center a dialog that
    // doesn't fill its max height; the ResizeObserver alone won't fire.
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, [contentEl, formIsOpen, formMinimized]);
  const hintVisible = formIsOpen && !formMinimized && hintPosition !== null;
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
    () =>
      (initialEditEventId !== null && initialEditEvent === null) ||
      (initialDetailEventId !== null && initialDetailEvent === null),
  );
  // A `?event=` deep link resolved while the component is already mounted (a
  // pinned-events tap on /dashboard is a same-route param change, so the
  // mount-time initializer above never re-runs). Track the last-handled id and
  // re-open the details for each new one; null (a stripped param) is ignored.
  const [prevDetailLinkId, setPrevDetailLinkId] = useState<string | null>(null);
  if (initialDetailEventId !== null && initialDetailEventId !== prevDetailLinkId) {
    setPrevDetailLinkId(initialDetailEventId);
    const found = events.find((event) => event.payload.eventId === initialDetailEventId) ?? null;
    setDetailEvent(found);
    setEditLinkFailed(found === null);
  }
  const [filterOpened, { open: openFilter, close: closeFilter }] = useDisclosure(false);
  const [pickerOpened, { open: openPicker, close: closePicker }] = useDisclosure(false);

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
  // unit), so the Week (D) pinned day header and the Week (H) day-label strip can
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

  // Week (H) view: the pinned day-label strip's inner track follows the grid's
  // horizontal scroll via a direct DOM transform, same as the hour ruler. The
  // track's cells are 24 slots wide (see WeekDayLabelStrip), so no JS index math
  // or re-renders are needed to stay aligned with the day columns.
  const weekBoxRef = useRef<HTMLDivElement | null>(null);
  // Cached realized geometry for the schedule grids: the hour-slot width in px
  // at zoom 1 and the sticky label-column width in px. Probed once per geometry
  // change (mount / view switch / breakpoint / group presence) — never on a
  // zoom, where the slot width derives from the zoom ratio instead (re-probing
  // on zoom forced several synchronous reflows of the grid and delayed the
  // visible zoom — see the consolidated measurement effect below).
  const scheduleGeometryRef = useRef<{
    key: string;
    baseSlotPx: number;
    labelPx: number;
  } | null>(null);
  // Inner tracks of the pinned rulers follow horizontal scroll via direct DOM
  // transforms (see TimeRulerStrip); their cell width rides the --ruler-slot
  // var set on the content box by the measurement effect below. Viewport refs
  // sync the tracks on mount/load, when the views' start-scroll effects have
  // already positioned the grids.
  const weekRulerRef = useRef<HTMLDivElement | null>(null);
  const dayRulerRef = useRef<HTMLDivElement | null>(null);
  const weekDayLabelRef = useRef<HTMLDivElement | null>(null);
  const weekViewportRef = useRef<HTMLDivElement | null>(null);
  const dayViewportRef = useRef<HTMLDivElement | null>(null);
  const handleWeekScroll = useCallback((pos: { x: number }) => {
    if (weekDayLabelRef.current) {
      weekDayLabelRef.current.style.transform = `translateX(${-pos.x}px)`;
    }
    if (weekRulerRef.current) {
      weekRulerRef.current.style.transform = `translateX(${-pos.x}px)`;
    }
  }, []);
  const handleDayScroll = useCallback((pos: { x: number }) => {
    if (dayRulerRef.current) {
      dayRulerRef.current.style.transform = `translateX(${-pos.x}px)`;
    }
  }, []);
  // Drag-to-pan + edge pan buttons for the schedule grids (see useGridPan):
  // Mantine hides the native scrollbar and its 4px bar sits at the bottom of
  // a full-height table, so without this there is no discoverable horizontal
  // affordance. Always enabled — overflow exists on both desktop and mobile.
  const schedulePan = useGridPan();
  const weekGridViewportRef = useMergedRef(weekViewportRef, schedulePan.viewportRef);
  const dayGridViewportRef = useMergedRef(dayViewportRef, schedulePan.viewportRef);
  // Stable identity: the schedule views must not receive fresh
  // `scrollAreaProps` objects on every scroll frame (schedulePan.viewportProps
  // is memoized and only changes at a drag/scroll-edge boundary).
  const weekScrollAreaProps = useMemo(
    () => ({
      viewportRef: weekGridViewportRef,
      onScrollPositionChange: handleWeekScroll,
      viewportProps: schedulePan.viewportProps,
    }),
    [handleWeekScroll, weekGridViewportRef, schedulePan.viewportProps],
  );
  const dayScrollAreaProps = useMemo(
    () => ({
      viewportRef: dayGridViewportRef,
      onScrollPositionChange: handleDayScroll,
      viewportProps: schedulePan.viewportProps,
    }),
    [handleDayScroll, dayGridViewportRef, schedulePan.viewportProps],
  );
  // Month view horizontal tracking: the pinned weekday-initials strip follows
  // the MonthView's ScrollArea scroll (the grid overflows on narrow screens).
  const monthViewportRef = useRef<HTMLDivElement | null>(null);
  const monthWeekdayTrackRef = useRef<HTMLDivElement | null>(null);
  const handleMonthScroll = useCallback((pos: { x: number }) => {
    if (monthWeekdayTrackRef.current) {
      monthWeekdayTrackRef.current.style.transform = `translateX(${-pos.x}px)`;
    }
  }, []);
  const monthScrollAreaProps = useMemo(
    () => ({
      viewportRef: monthViewportRef,
      onScrollPositionChange: handleMonthScroll,
    }),
    [handleMonthScroll],
  );

  const [isRefreshing, startRefresh] = useTransition();

  // Data freshness tracking: the label shows "Saved · HH:MM" whenever the data
  // may not be the latest — by default (the server-side events cache serves
  // stale data most of the time) and after a cached-document open (the SW's
  // injected `__C2_STAMP__` gives the truthful saved-at time via
  // `initialSavedAt`). It is hidden only while data was recently confirmed
  // fresh — for 60s after a force-refresh or a mutation, matching
  // GCAL_CACHE_FRESH_MS.
  const savedAtRef = useRef(initialSavedAt());
  const [isDataFresh, setIsDataFresh] = useState(false);

  const savedInfo = useMemo(() => {
    if (isDataFresh) return null;
    const d = new Date(savedAtRef.current);
    if (Number.isNaN(d.getTime())) return null;
    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return {
      label: `Saved · ${time}`,
      full: `Showing saved data from ${d.toLocaleString()}. Pull to refresh or tap Force refresh for the latest.`,
    };
  }, [isDataFresh]);

  // After a force-refresh or mutation marks the data fresh, revert to the
  // "Saved" state once the server-side events cache freshness window elapses —
  // after that, reads may again be served from the cache, so the data is
  // plausibly saved again. Matches GCAL_CACHE_FRESH_MS (60s).
  useEffect(() => {
    if (!isDataFresh) return;
    const timer = setTimeout(() => setIsDataFresh(false), 60_000);
    return () => clearTimeout(timer);
  }, [isDataFresh]);

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
    pinnedViews: pinned,
    zoom,
  });

  // The date shown in the agenda day modal; persists through the exit
  // animation so the shrinking box still has content.
  const agendaViewDate = agendaDate ?? displayAgendaDate;

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
  const periodLabel = shownIsAgenda
    ? dayjs(viewedDay ?? shownDate).format("ddd, MMM D, YYYY")
    : shownIsWeek
      ? weekLabel
      : shownIsAnchored
        ? dayLabel
        : monthLabel;

  // Screen-reader announcement of view/period changes (tab taps, chevrons,
  // Today, date picker, agenda swipes all flow through the optimistic chrome,
  // so one watcher covers them). The first render only records the baseline —
  // announcing on plain page load would be noise.
  const lastAnnouncedChromeRef = useRef<string | null>(null);
  useEffect(() => {
    const message = `${VIEW_TAB_META[shownView].label} view, ${periodLabel}`;
    if (lastAnnouncedChromeRef.current === null) {
      lastAnnouncedChromeRef.current = message;
      return;
    }
    if (lastAnnouncedChromeRef.current !== message) {
      lastAnnouncedChromeRef.current = message;
      announce(message);
    }
  }, [shownView, periodLabel]);
  const today = dayjs().format("YYYY-MM-DD");
  const todayMonth = dayjs().format("YYYY-MM");
  // Start-scroll anchor for the Day/Week (H) timelines: when the shown period
  // contains today the grid opens at the current time, otherwise the 07:00
  // working-day default. Only consumed by the library's client mount effect
  // (never emitted to the DOM), so the client-computed value is hydration-safe.
  const currentScrollTime = dayjs().format("HH:mm:ss");

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
              label: "Myself",
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

  // "Highlight my entries": the events the current user created or is tagged
  // on — the same semantics as the Myself quick filter. Drives the per-view
  // highlights (month top rows + chip ring, agenda row tint, the resource-row
  // tint via the label marker below); see docs/dashboard-views.md §1.5.
  const myEventIds = useMemo(
    () =>
      new Set(
        events
          .filter((event) => eventMatchesUserFilter(event.payload, [currentUser]))
          .map((event) => event.id),
      ),
    [events, currentUser],
  );
  // The month grid assigns each day's rows greedily in input order, so feed
  // the user's events first (each block time-sorted) and they claim the top
  // rows of every day.
  const monthEvents = useMemo(() => sortMineFirst(events, myEventIds), [events, myEventIds]);

  // renderEvent replacements for Month + Agenda: the same default root, plus
  // a highlight class on the user's events (the styling lives in globals.css).
  // Month: c2-my-event = amber ring around the chip (also in the "+N more"
  // popup). Agenda: c2-my-agenda-event = amber bar/tint + bold title.
  const renderMyMonthEvent: MyEventRender = useCallback(
    (event, props) => (
      <UnstyledButton
        {...props}
        className={
          myEventIds.has(String(event.id))
            ? `${props.className ?? ""} c2-my-event`
            : props.className
        }
      />
    ),
    [myEventIds],
  );
  const renderMyAgendaEvent: MyEventRender = useCallback(
    (event, props) => (
      <UnstyledButton
        {...props}
        className={
          myEventIds.has(String(event.id))
            ? `${props.className ?? ""} c2-my-agenda-event`
            : props.className
        }
      />
    ),
    [myEventIds],
  );

  const isWeekV2 = view === "weekv2";
  const isWeek = view === "week" || isWeekV2;
  const isSchedule = view === "schedule";
  const isAgenda = view === "agenda";
  // Day-anchored views (Day, Week (D), Agenda): a `?date=` anchor drives the
  // fetch (Week (D) shows the Monday-first week containing the anchor day).
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

  // Strip the one-shot `event` param (Pinned Events deep link) the same way,
  // so a refresh/back doesn't silently re-open the details modal.
  const detailParamClearedRef = useRef(false);
  useEffect(() => {
    if (!initialDetailEventId || detailParamClearedRef.current) {
      return;
    }
    detailParamClearedRef.current = true;
    router.push(buildHref({ event: null }));
  }, [buildHref, initialDetailEventId, router]);

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
    // Clean the URL with a replace (no history entry) and then re-read from
    // the server. `router.refresh()` bypasses the Client Router Cache — which
    // `staleTimes.dynamic: 120` would otherwise serve for the base URL for up
    // to 2 minutes — so the freshly force-fetched rows (already upserted to the
    // server cache by the forced render) are what stays on screen. A plain
    // `router.push` here re-served the pre-edit snapshot and reverted the edit.
    router.replace(buildHref({ refresh: null }), { scroll: false });
    router.refresh();
  }, [buildHref, router, searchParams]);

  // Force refresh: a transition of its own (the button's spinner) wrapping
  // router.push directly — the transition Next runs inside push stays pending
  // for the whole navigation, so `isRefreshing` covers the load. The server
  // renders that same request with `force: true`; the grid skeleton shows for
  // the same window. Ordinary data navigations (month/week/day/view/filter)
  // show the same grid skeleton while pending and swap the new grid in place
  // (with a one-shot fade-in) when it commits.
  function refreshNow() {
    // Force-refresh bypasses the cache freshness window and blocks on fresh
    // Google reads, so the data is fresh once the transition lands. Mark it
    // now (the 60s timeout below reverts it to "Saved" afterwards).
    savedAtRef.current = Date.now();
    setIsDataFresh(true);
    startRefresh(() => {
      router.push(buildHref({ refresh: String(Date.now()) }));
    });
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
    // Anchoring reads the optimistic chrome so leaving mid-flight (tap Week (H) or Week (D),
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
  // Same group semantics as `activeFilterCount`: a partial Calendars
  // selection, any Users selection and any Event Types selection each count
  // as one active filter group.
  function filterCountMessage(calCount: number, userCount: number, typeCount: number): string {
    const count =
      (calCount > 0 && calCount < calendars.length ? 1 : 0) +
      (userCount > 0 ? 1 : 0) +
      (typeCount > 0 ? 1 : 0);
    if (count === 0) return "Filters cleared";
    return count === 1 ? "1 filter active" : `${count} filters active`;
  }

  function handleApplyFilters(values: Record<string, string[]>) {
    const cals = values.Calendars ?? [];
    const users = values.Users ?? [];
    const types = values["Event Types"] ?? [];
    navigate({
      cal: cals.length > 0 ? cals.join(",") : null,
      users: users.length > 0 ? users.join(",") : null,
      types: types.length > 0 ? types.join(",") : null,
    });
    announce(filterCountMessage(cals.length, users.length, types.length));
  }

  const onlyMeActive = selectedUserIds.length === 1 && selectedUserIds[0] === currentUser;
  const onlyMeAvailable = filterUsers.some((user) => user.id === currentUser);

  function toggleOnlyMe(checked: boolean) {
    // Search groups: empty selection means "no filter", so unchecked clears
    // the Users filter entirely.
    navigate({ users: checked ? currentUser : null });
    announce(filterCountMessage(selectedCalendarIds.length, checked ? 1 : 0, selectedTypes.length));
  }

  function togglePinView() {
    // Pinning moves the active tab to the front (last pinned = leftmost);
    // unpinning drops it back into the default tab order. Pure display order —
    // no navigation, so no skeleton and no `_fresh` marker. The toggle only
    // writes the cookie, so SWR-cached /dashboard payloads rendered before it
    // still carry the old order — invalidating the current pathname keeps the
    // next reload/navigation from serving one (a stale commit would re-seed
    // the prop and the state writer would clobber the fresh pin in the cookie).
    void invalidateCurrentPathCaches();
    setPinned(pinned.includes(view) ? pinned.filter((mode) => mode !== view) : [view, ...pinned]);
  }

  function clearFilters() {
    // Null params restore the server defaults (non-admins default to their
    // own department's calendar).
    navigate({ cal: null, users: null, types: null });
    announce("Filters cleared");
  }

  function openCreate(dateValue: string, originRect: Rect | null = null) {
    setFormMinimized(false);
    setFormOriginRect(originRect);
    setFormState({ event: null, templateEvent: null, defaultDate: dateValue });
  }

  function closeForm() {
    setFormMinimized(false);
    setFormState(null);
  }

  function minimizeForm() {
    // Shrink into the floating bubble (bottom-right) instead of wherever the
    // form was opened from; the draft stays alive in the keepMounted modal.
    // Used by the header chevron, outside clicks and Escape — none of them
    // discard the draft.
    setFormOriginRect(null);
    setFormMinimized(true);
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

  // Mantine's AgendaView leaks adjacent-day all-day events into the selected
  // day (its day-granularity end check lets an exclusive end land exactly on
  // the viewed midnight), so pre-filter to exactly the occupying events.
  const agendaTabEvents = useMemo(() => eventsOnDay(events, headerDate), [events, headerDate]);
  const agendaModalEvents = useMemo(
    () => (agendaViewDate ? eventsOnDay(events, agendaViewDate) : []),
    [events, agendaViewDate],
  );
  // "Today" affordance state, keyed to the optimistic chrome like the label:
  // the menu item reflects where you're headed, not where the fetch is at.
  const onToday = shownIsWeek
    ? week !== null && week.some((day) => day === today)
    : shownIsAnchored
      ? headerDate === today
      : shownMonth === todayMonth;

  // Measure the schedule grids' realized geometry and keep the pinned rulers
  // and scroll position in sync, pre-paint. Mantine sizes each hour slot in
  // `rem` (`--resources-*-view-slot-width`), so a hardcoded px guess would
  // drift with a non-default root font size or `--mantine-scale`; probe the
  // CSS variable once when the geometry actually changes (mount, view switch,
  // breakpoint flip, group presence) and cache it. A timeline zoom scales the
  // slot width by exactly the zoom ratio, so its new width is derived from the
  // cached base width — never re-probed — and the grid's horizontal scroll is
  // re-anchored so the time at the viewport's center stays centered. Probing on
  // every zoom (as before) appended/removed a probe element and forced several
  // synchronous reflows of the large grid before paint, delaying the visible
  // zoom; the cached geometry keeps the zoom path pure arithmetic + one write.
  useLayoutEffect(() => {
    const zoomChanged = prevZoomRef.current !== zoom;
    const oldZoom = prevZoomRef.current;
    prevZoomRef.current = zoom;

    const isWeekGrid = view === "week";
    const isDayGrid = isSchedule;
    if ((!isWeekGrid && !isDayGrid) || gridLoading) {
      return;
    }
    const box = weekBoxRef.current;
    const viewport = isWeekGrid ? weekViewportRef.current : dayViewportRef.current;
    if (!box || !viewport) {
      return;
    }

    const hasGroups = scheduleResources.groups !== undefined;
    const geometryKey = `${isWeekGrid ? "week" : "day"}:${isDesktop}:${hasGroups}`;
    let geometry = scheduleGeometryRef.current;
    if (!geometry || geometry.key !== geometryKey) {
      const slotVar = isWeekGrid
        ? "--resources-week-view-slot-width"
        : "--resources-day-view-slot-width";
      const root = Array.from(box.children).find(
        (child) => getComputedStyle(child).getPropertyValue(slotVar).trim() !== "",
      );
      if (!root) {
        return;
      }
      const slotPx = measuredWidth(root, `var(${slotVar})`);
      if (slotPx <= 0) {
        return;
      }
      const prefix = isWeekGrid ? "week" : "day";
      const labelResource = measuredWidth(
        root,
        `var(--resources-${prefix}-view-resource-label-width)`,
      );
      const labelGroup = hasGroups
        ? measuredWidth(root, `var(--resources-${prefix}-view-group-label-width)`)
        : 0;
      geometry = {
        key: geometryKey,
        baseSlotPx: slotPx / zoom,
        labelPx: labelResource + labelGroup,
      };
      scheduleGeometryRef.current = geometry;
    }

    const slot = geometry.baseSlotPx * zoom;
    box.style.setProperty("--ruler-slot", `${slot}px`);

    if (zoomChanged) {
      viewport.scrollLeft = reanchorScrollLeft(
        viewport.scrollLeft,
        viewport.clientWidth,
        geometry.labelPx,
        geometry.baseSlotPx * oldZoom,
        slot,
      );
    }

    // The library's start-scroll effects (startScrollTime /
    // startScrollDateTime) reposition the grid on mount/zoom without a scroll
    // event; align the ruler track and the week day-label track with the real
    // scroll offset (this also picks up the re-anchored value above, since it
    // runs after the write).
    const ruler = isWeekGrid ? weekRulerRef.current : dayRulerRef.current;
    if (ruler) {
      ruler.style.transform = `translateX(${-viewport.scrollLeft}px)`;
    }
    if (isWeekGrid && weekDayLabelRef.current) {
      weekDayLabelRef.current.style.transform = `translateX(${-viewport.scrollLeft}px)`;
    }
  }, [view, gridLoading, isSchedule, isDesktop, zoom, scheduleResources]);

  // Shared by the Day, Week (H) and Week (D) resource views: a department row
  // is a building icon (its name as tooltip/aria), a user row is the shortname
  // label. The current user's row carries a `data-c2-my-row` marker span
  // (amber dot + bold label): globals.css tints exactly that row's label cell
  // and whole row through structural `:has()` rules on the marker.
  function renderResourceLabel(resource: ScheduleResourceData) {
    const row = resource as ScheduleResource;
    if (isDepartmentRowId(row.id)) {
      return (
        <IconBuilding
          size={16}
          color="var(--mantine-color-accent-6)"
          aria-label={row.fullName}
          title={row.fullName}
          style={{ flexShrink: 0 }}
        />
      );
    }
    const isMine = row.id === currentUser;
    const label =
      row.label === row.fullName ? (
        <Text
          size="sm"
          fw={isMine ? 600 : undefined}
          aria-label={isMine ? `You — ${row.fullName}` : undefined}
        >
          {row.label}
        </Text>
      ) : (
        // `events` replaces the default object, so `hover` is restated explicitly;
        // `touch` lets a tap open the tooltip on phones (tap-outside dismisses it).
        <Tooltip
          label={row.fullName}
          position="right"
          events={{ hover: true, focus: false, touch: true }}
        >
          <Text size="sm" fw={isMine ? 600 : undefined} aria-label={row.fullName}>
            {row.label}
          </Text>
        </Tooltip>
      );
    if (!isMine) {
      return label;
    }
    return (
      <span
        data-c2-my-row
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.25rem",
          maxWidth: "100%",
          minWidth: 0,
        }}
      >
        <span
          aria-hidden
          style={{
            flexShrink: 0,
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--mantine-color-accent-6)",
          }}
        />
        {label}
      </span>
    );
  }

  function renderGroupLabel(group: ScheduleResourceGroup) {
    return <span style={{ writingMode: "vertical-rl" }}>{group.label}</span>;
  }

  return (
    // Pulled up by the shell's md padding: AppShell.Main adds
    // --app-shell-padding ON TOP of the 56px header offset, which showed as a
    // body-background strip under the fixed header until the sticky chrome
    // scrolled up to pin flush. Negative margin starts the chrome at the
    // header's bottom edge (its sticky `top`), so rest and pinned states match.
    // fab-page-pad replaces pb="xl" (inline would beat the class): it reserves
    // clearance for the mobile Create/Quick-links FABs below the last grid
    // row and restores plain xl at lg (globals.css).
    <Stack
      className="fab-page-pad"
      gap="sm"
      style={{ marginTop: "calc(-1 * var(--app-shell-padding))" }}
    >
      {/* The sticky chrome block: view tabs + date-nav row pinned as one unit
          at every breakpoint. The wrapper is a direct child of the Stack, so
          its containing block spans the whole page and sticky can hold it at
          the top (a sticky element pinned to a shorter root would scroll away
          with it); page content slides beneath its opaque background. Its
          measured height feeds the Week (D) day header and the Week (H) label
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
          // In immersive the tabs are hidden, so the border would orphan above
          // the date-nav row — drop it.
          borderBottom: immersiveMode.active
            ? undefined
            : "1px solid var(--mantine-color-default-border)",
        }}
      >
        {/* View tabs are chrome too — they vanish in fullscreen, leaving only
            the grid and the date-nav row above it. */}
        {!immersiveMode.active && (
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
        )}

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
            {periodLabel}
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
                <Menu.Item leftSection={<IconCalendarDot size={16} />} onClick={openPicker}>
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
                  Myself
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
              {savedInfo ? (
                <Tooltip label={savedInfo.full} multiline maw={260} withArrow>
                  <Menu.Label style={{ cursor: "default" }}>{savedInfo.label}</Menu.Label>
                </Tooltip>
              ) : null}
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
      </Box>

      {currentUserName.trim().length <= 2 && (
        <Alert color="yellow" title="Your display name is incomplete">
          Your current display name &ldquo;{currentUserName}&rdquo; is too short — you&apos;ll be
          difficult to identify in the calendar, schedule view, and event titles.
          <Text component="p" mt="xs" size="sm">
            <b>If you are an admin:</b> Go to{" "}
            <Text component="span" fw={700}>
              Settings → Users
            </Text>{" "}
            → find this user → edit and set a full display name (e.g. &ldquo;Lim Kah Hwee&rdquo;).
          </Text>
          <Text component="p" mt="xs" size="sm">
            <b>If you are not an admin:</b> Ask an admin to update your name via{" "}
            <Text component="span" fw={700}>
              Settings → Users
            </Text>
            .
          </Text>
          <Text component="p" mt="xs" size="sm" c="dimmed">
            Without a proper name, your events will show the short name to everyone, you&apos;ll be
            hard to pick in invitee lists, and KAH group emails may reference you by initials only.
          </Text>
        </Alert>
      )}

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
            days={week}
            hasGroups={scheduleResources.groups !== undefined}
            resourceLabelWidth={scheduleLabelWidths.resource}
            groupLabelWidth={scheduleLabelWidths.group}
            chromeOffset={chromeHeight}
            innerRef={weekDayLabelRef}
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
            days={7}
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
        {/* Pinned weekday-initials strip for the Month view (replaces Mantine's
            own row, which scrolls away inside the grid's ScrollArea). */}
        {!gridLoading && view === "month" && (
          <MonthWeekdayStrip chromeOffset={chromeHeight} innerRef={monthWeekdayTrackRef} />
        )}
        {gridLoading ? (
          // Skeleton flavor follows the optimistic view: the shape you tapped
          // is what appears to load (same contract as loading.tsx, which
          // resolves the remembered view from the cookie).
          <>
            <LoadingStatus label="Loading calendar" />
            {shownView === "month" ? (
              <MonthGridSkeleton rows={monthGridRows(shownMonth)} />
            ) : shownIsWeekV2 ? (
              <WeekMatrixSkeleton />
            ) : shownIsWeek ? (
              <WeekGridSkeleton />
            ) : shownIsAgenda ? (
              <AgendaListSkeleton />
            ) : (
              <ScheduleGridSkeleton />
            )}
          </>
        ) : view === "month" ? (
          <MonthView
            date={`${month}-01 00:00:00`}
            // Pre-sorted so the user's events claim the top rows of each day
            // (the grid assigns rows greedily in input order); their chips get
            // the amber ring via renderEvent.
            events={monthEvents}
            // The page range-reads the whole 6-week grid (monthGridMonths), so
            // the dimmed adjacent-month days render their events too.
            withHeader={false}
            // The built-in weekday row scrolls away (its ScrollArea is
            // content-height); the pinned MonthWeekdayStrip replaces it.
            withWeekDays={false}
            scrollAreaProps={monthScrollAreaProps}
            maxEventsPerDay={isDesktop ? 4 : 3}
            renderEvent={renderMyMonthEvent}
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
                // The user's entries get the amber bar/tint + bold title
                // (c2-my-agenda-event, globals.css); time order is kept.
                renderEvent={renderMyAgendaEvent}
                onEventClick={(event, e) => {
                  setDetailOriginRect(e.currentTarget.getBoundingClientRect());
                  setDetailEvent(event as unknown as CalendarEvent);
                }}
              />
            </div>
          </div>
        ) : scheduleResources.resources.length === 0 ? (
          <Paper withBorder radius="md">
            {userFilterActive ? (
              <EmptyState
                icon={<IconUserOff size={18} />}
                description="No active users match the Users filter."
                actionLabel="Clear filters"
                onAction={clearFilters}
              />
            ) : (
              <EmptyState
                icon={<IconUserOff size={18} />}
                description="No users in the selected calendars yet. Assign users to a department (Admin Settings) or adjust the filters."
                actionLabel="Adjust filters"
                onAction={openFilter}
              />
            )}
          </Paper>
        ) : isWeekV2 && week ? (
          <WeekMatrixView
            days={week}
            resources={scheduleResources.resources}
            groups={scheduleResources.groups}
            events={events}
            today={today}
            myRowId={currentUser}
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
            chromeOffset={chromeHeight}
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
            // Week containing today opens at the current time, other weeks at
            // Monday 07:00 (mount-only effect, re-applied after each tab
            // switch / date navigation remounts the grid via the skeleton).
            startScrollDateTime={
              week
                ? week.includes(today)
                  ? `${today} ${currentScrollTime}`
                  : `${week[0]} 07:00:00`
                : undefined
            }
            onEventClick={(event, e) => {
              setDetailOriginRect(e.currentTarget.getBoundingClientRect());
              setDetailEvent(event as unknown as CalendarEvent);
            }}
            // The resource-label column width is not a typed ResourcesWeekView
            // var, so it is set as a CSS variable on the root (cascades to the
            // all-day sticky labels and the time-indicator offset the same way
            // the Day view's typed var does). The hour-slot width is the zoomed
            // value (see scheduleLabelWidths/weekSlotWidthValue above); the
            // pinned day-label strip + hour ruler re-measure it on change.
            style={
              {
                "--resources-week-view-resource-label-width": scheduleLabelWidths.resource,
                "--resources-week-view-slot-width": weekSlotWidthValue,
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
          <ResourcesDayView
            date={date}
            resources={scheduleResources.resources}
            groups={scheduleResources.groups}
            events={scheduleEvents}
            startTime="00:00:00"
            endTime="23:59:59"
            intervalMinutes={60}
            // Today opens at the current time; other days at the 07:00
            // working-day default (re-applied on every mount, i.e. after each
            // tab switch / date navigation remounts the grid via the skeleton).
            startScrollTime={date === today ? currentScrollTime : "07:00:00"}
            rowHeight={56}
            withHeader={false}
            withCurrentTimeIndicator
            onEventClick={(event, e) => {
              setDetailOriginRect(e.currentTarget.getBoundingClientRect());
              setDetailEvent(event as unknown as CalendarEvent);
            }}
            // Zoomed hour-slot width (default 80px at zoom 1); the pinned hour
            // ruler re-measures it on change (layout effect below).
            style={{ "--resources-day-view-slot-width": daySlotWidthValue } as CSSProperties}
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

      {/* Timeline navigation for the Day/Week (H) grids: the zoom in/out pair
          and the right pan arrow share one right-edge control cluster, with the
          left pan arrow edge-anchored on the left (see GridNavControls). Gated
          on the real grid, so a stale scroll state can't linger over the
          skeleton; the zoom pair renders even when the grid fits without
          overflowing. */}
      {!gridLoading &&
        scheduleResources.resources.length > 0 &&
        (isSchedule || (view === "week" && week !== null)) && (
          <GridNavControls
            anchorRef={weekBoxRef}
            canScrollLeft={schedulePan.canScrollLeft}
            canScrollRight={schedulePan.canScrollRight}
            onPan={schedulePan.panTo}
            zoom={zoom}
            onZoomIn={() => {
              const next = stepZoom(zoom, 1);
              setZoom(next);
              announce(`Zoom ${Math.round(next * 100)}%`);
            }}
            onZoomOut={() => {
              const next = stepZoom(zoom, -1);
              setZoom(next);
              announce(`Zoom ${Math.round(next * 100)}%`);
            }}
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
                <AgendaView
                  rangeStart={agendaViewDate}
                  rangeEnd={agendaViewDate}
                  events={agendaModalEvents}
                  styles={{ agendaViewHeader: { display: "none" } }}
                  renderEvent={renderMyAgendaEvent}
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
          setFormState({ event, templateEvent: null, defaultDate: today });
        }}
        onDuplicate={(event, originRect) => {
          setDetailEvent(null);
          setFormMinimized(false);
          setFormOriginRect(originRect);
          setFormState({
            event: null,
            templateEvent: event,
            defaultDate: event.start.slice(0, 10),
          });
        }}
        onDeleted={() => {
          setDetailEvent(null);
          setAgendaDate(null);
          savedAtRef.current = Date.now();
          setIsDataFresh(true);
          window.dispatchEvent(new CustomEvent(PINNED_EVENTS_CHANGED_EVENT));
          void invalidateCurrentPathCaches().then(() => router.refresh());
        }}
        peopleNames={peopleNames}
        calendarNames={calendarNames}
        originRect={detailOriginRect}
        currentUserId={currentUser}
        isAdmin={isAdmin}
      />

      <Modal.Root
        opened={formIsOpen && !formMinimized}
        onClose={minimizeForm}
        keepMounted
        centered
        size={isDesktop ? "md" : "sm"}
        zIndex={250}
        transitionProps={formTransitionProps}
      >
        <Modal.Overlay />
        <Modal.Content ref={setContentEl}>
          <Modal.Header>
            <Modal.Title>
              {formState?.event
                ? "Edit event"
                : formState?.templateEvent
                  ? "Duplicate event"
                  : "New event"}
            </Modal.Title>
            <Group gap="xs" ml="auto">
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label="Minimize event form"
                onClick={minimizeForm}
              >
                <IconChevronDown size={16} />
              </ActionIcon>
              {/* Custom X: Modal.CloseButton would route through onClose (which
                  now minimizes), but the close button must discard the draft. */}
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label="Close and discard draft"
                onClick={closeForm}
              >
                <IconX size={16} />
              </ActionIcon>
            </Group>
          </Modal.Header>
          <Modal.Body>
            {formState && (
              <EventForm
                key={
                  formState.event
                    ? formState.event.id
                    : formState.templateEvent
                      ? `dup-${formState.templateEvent.id}`
                      : `new-${formState.defaultDate}`
                }
                event={formState.event}
                templateEvent={formState.templateEvent}
                defaultDate={formState.defaultDate}
                eventTypes={eventTypes}
                eventTitleTemplate={eventTitleTemplate}
                viewEventTitleTemplate={viewEventTitleTemplate}
                viewLabel={VIEW_TAB_META[view].label}
                currentUser={currentUser}
                isAdmin={isAdmin}
                inviteeDepartments={inviteeDepartments}
                inviteeUsers={inviteeUsers}
                onDone={() => {
                  closeForm();
                  savedAtRef.current = Date.now();
                  setIsDataFresh(true);
                  window.dispatchEvent(new CustomEvent(PINNED_EVENTS_CHANGED_EVENT));
                  void invalidateCurrentPathCaches().then(() => router.refresh());
                }}
              />
            )}
          </Modal.Body>
        </Modal.Content>
      </Modal.Root>

      {/* Floating caption under the dialog box. It lives outside the Paper
          deliberately — the Paper clips anything inside it (overflow-y) —
          and portals to <body> (like the restore bubble's Affix) so its
          z-index competes at the root level: 260 puts it above the modal's
          250 overlay and below the 300 bubble. Pinned to the measured Paper
          bottom, cross-fading with the modal's own 250ms transitions.
          pointer-events: none, so tapping the caption lands on the overlay
          → minimizes, which is what it advertises. */}
      <Portal>
        <Text
          size="xs"
          aria-hidden={!hintVisible}
          style={{
            position: "fixed",
            top: hintPosition ? hintPosition.bottom + 8 : -9999,
            left: hintPosition?.left ?? -9999,
            width: hintPosition?.width ?? 0,
            textAlign: "center",
            margin: 0,
            zIndex: 260,
            color: "rgba(255, 255, 255, 0.85)",
            opacity: hintVisible ? 1 : 0,
            transition: "opacity 250ms ease",
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          Tap outside to minimize
        </Text>
      </Portal>

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
