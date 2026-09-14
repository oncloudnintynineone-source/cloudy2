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
  useSyncExternalStore,
  useTransition,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Group,
  Menu,
  Modal,
  Paper,
  Portal,
  Stack,
  Tabs,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
  useMantineTheme,
} from "@mantine/core";
import { useDisclosure, useDrag, useMediaQuery, useMergedRef } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  AgendaView,
  MonthView,
  ResourcesDayView,
  ResourcesWeekView,
  WeekView,
  type ScheduleResourceData,
  type ScheduleResourceGroup,
} from "@mantine/schedule";
import {
  IconBuilding,
  IconCalendarDot,
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconLink,
  IconPlus,
  IconSettings,
  IconUser,
  IconUserOff,
  IconX,
} from "@tabler/icons-react";

import {
  AgendaListSkeleton,
  DualPaneSkeleton,
  MonthGridSkeleton,
  ScheduleGridSkeleton,
  WeekGridSkeleton,
  WeekGridViewSkeleton,
  WeekMatrixSkeleton,
  monthGridRows,
} from "./calendarSkeleton";
import { formatWeekLabel } from "./clientDateTime";
import { DateSelectorModal } from "@/components/DateSelectorModal";
import { EmptyState } from "@/components/EmptyState";
import { FilterButton } from "@/components/FilterButton";
import { FilterModal, type FilterGroup } from "@/components/FilterModal";
import { GridNavControls } from "@/components/GridNavControls";
import { FullscreenToggle } from "@/components/FullscreenToggle";
import {
  BUTTON_LOADER_PROPS,
  COARSE_POINTER_MEDIA_QUERY,
  DESKTOP_WIDE_MEDIA_QUERY,
  NARROW_MEDIA_QUERY,
} from "@/lib/theme";
import {
  FAB_ICON_SIZE,
  FAB_SIZE,
  FloatingActionButton,
  FloatingToolbar,
} from "@/components/FloatingToolbar";
import { LoadingStatus } from "@/components/LoadingStatus";
import { QuickLinksMenu, type QuickLinkMenuItem } from "@/components/QuickLinksMenu";
import { eventsOnDay } from "@/lib/events/agenda";
import { monthGridMonths, weekDays } from "@/lib/events/datetime";
import { sortMineFirst } from "@/lib/events/mineFirst";
import type { CalendarEvent } from "@/lib/events/queries";
import type { TitleRecipe } from "@/lib/settings/titleRecipe";
import type { EventActionOk } from "@/lib/events/actions";
import type { LocationCategory } from "@/lib/events/locationPolicy";
import {
  applyOptimisticOps,
  isOptimisticStandIn,
  type OptimisticOp,
} from "@/lib/events/optimistic";
import type { TimeOption } from "@/lib/events/timeOptions";
import { eventMatchesUserFilter } from "@/lib/events/userFilter";
import { CONTENT_ENTER_CLASS, useContentEnter } from "@/lib/loading/contentEnter";
import { useMinSkeletonHold } from "@/lib/loading/minHoldLoading";
import { departmentPathLabels, departmentTreeRows } from "@/lib/roster/hierarchy";
import { useColdStartContent } from "@/components/ColdStartReady";
import {
  modalContentWidth,
  scaleFromRect,
  transformOriginFromRect,
  type Rect,
} from "@/lib/motion/origin";
import { MOTION } from "@/lib/motion/timing";
import {
  buildScheduleResources,
  expandScheduleEvents,
  isDepartmentRowId,
  type ScheduleResource,
  type ScheduleUser,
} from "@/lib/events/schedule";
import {
  getAgendaSwipeHintServerSnapshot,
  getAgendaSwipeHintSnapshot,
  markAgendaSwipeHintSeen,
  subscribeAgendaSwipeHint,
} from "@/lib/ui/agendaSwipeHint";
import { announce } from "@/lib/ui/announcer";
import { DUAL_SPLIT_DEFAULT, clampDualSplit } from "@/lib/ui/dualSplit";
import { useGridPan } from "@/lib/ui/gridPan";
import { useImmersiveMode } from "@/lib/ui/immersiveMode";
import { MAX_MONTH_ZOOM, MIN_MONTH_ZOOM, stepMonthZoom, type MonthZoom } from "@/lib/ui/monthZoom";
import {
  daySlotWidth,
  gridWeekColumnWidth,
  gridWeekSlotHeight,
  MIN_COLUMN_ZOOM,
  reanchorScrollLeft,
  reanchorScrollTop,
  stepZoom,
  weekSlotWidth,
  type SlotZoom,
} from "@/lib/ui/slotZoom";
import { usePersistDashboardNav } from "@/lib/ui/uiStateClient";
import { PINNED_EVENTS_CHANGED_EVENT } from "@/lib/ui/pinnedPanel";
import { notifyEventsChanged } from "@/lib/ui/eventChanges";
import { createDashboardView, saveDashboardViewFilters } from "@/lib/dashboardViews/actions";
import {
  DASHBOARD_VIEW_KIND_LABELS,
  periodSwitchDirection,
  tabSwitchNeedsReload,
  tabSwitchTarget,
  viewSwitchDirection,
  type DashboardTabFilters,
  type DashboardViewKind,
  type DashboardViewTab,
} from "@/lib/dashboardViews/views";
import { EditViewsModal } from "./EditViewsModal";
import { EventDetail } from "./EventDetail";
import { EventForm } from "./EventForm";
import { WeekMatrixView } from "./WeekMatrixView";
import { ViewTypePicker } from "./ViewTypePicker";
import { VIEW_TAB_META } from "./viewMeta";
import { AgendaSwipeHint } from "./AgendaSwipeHint";
import { DualPaneView } from "./DualPaneView";
import { MonthWeekdayStrip } from "./MonthWeekdayStrip";
import { useDashboardData } from "./DashboardDataContext";

type ViewMode = DashboardViewKind;

/**
 * Mantine's `RenderEvent` signature (the type itself is not re-exported from
 * the package root) — the Month/Agenda `renderEvent` prop contract.
 */
type MyEventRender = (
  event: { id: string | number },
  props: ComponentPropsWithoutRef<"button"> & { children: ReactNode },
) => ReactElement;

interface EventTypeOption {
  name: string;
  shortname: string | null;
  groupId: string | null;
  timeOptions: TimeOption[];
  allowedLocations: LocationCategory[];
  showRemarks: boolean;
  showInvitees: boolean;
  /** Whether the wizard shows the Location step for this type (off = skip). */
  showLocation: boolean;
  /** Admin-pinned event color, null = the deterministic default. */
  color: string | null;
}

export interface DashboardViewProps {
  month: string;
  /**
   * The rendered day anchor. URL-first: `DashboardScreen` passes the `?date=`
   * param when present (so back/forward, deep links and in-month day moves
   * reposition the Day/Week (H) grids and chrome even though no fetch runs),
   * falling back to the server-resolved day when the URL omits it.
   */
  date: string;
  /**
   * The dashboard's on-demand tabs in strip order (server-side per account —
   * src/lib/dashboardViews). The server resolves the active tab from the URL
   * `?view=` / remembered state and passes it below.
   */
  tabs: DashboardViewTab[];
  /**
   * The tab being rendered: its kind picks the renderer/anchored semantics,
   * its stored filters resolve to the `selected*` props.
   */
  activeView: DashboardViewTab;
  /** Whether the user can create/rename/reorder/delete tabs (false for the
   *  break-glass admin session, which has no stored views). */
  canManageViews: boolean;
  /**
   * Remembered Day/Week (H) hour-slot zoom level, resolved from the UI-state
   * cookie before first paint (a relaunch restores the last zoom with no
   * width jump). Seeding value for the client zoom state only.
   */
  initialZoom: SlotZoom;
  /**
   * Remembered Week (Grid) column-width zoom level, resolved from the UI-state
   * cookie before first paint the same way. Seeding value for the client
   * grid-week column-zoom state.
   */
  initialGridWeekColZoom: SlotZoom;
  /**
   * Remembered Week (Grid) hour-slot-height zoom level, resolved from the
   * UI-state cookie before first paint the same way. Seeding value for the
   * client grid-week row-zoom state.
   */
  initialGridWeekRowZoom: SlotZoom;
  /**
   * Remembered Month-grid zoom level (a fit-width multiplier, 1 = the whole
   * week fits the viewport width), resolved from the UI-state cookie before
   * first paint the same way. Seeding value for the client month-zoom state.
   */
  initialMonthZoom: MonthZoom;
  /**
   * Remembered Dual Pane split (the Month pane's width fraction), resolved
   * from the UI-state cookie before first paint. Seeding value for the client
   * split state.
   */
  initialDualSplit: number;
  events: CalendarEvent[];
  calendars: { id: string; name: string; sortOrder: number; parentId: string | null }[];
  eventTypes: EventTypeOption[];
  /** Event type groups in display order, for the grouped type picker. */
  eventTypeGroups: { id: string; name: string; sortOrder: number }[];
  eventTitleRecipe: TitleRecipe;
  viewEventTitleRecipe: TitleRecipe;
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
  /** The role defaults this user's tab filters fall back to (admin: all
   *  calendars; non-admin: their own department; users/types: none). */
  defaultFilters: DashboardTabFilters;
  currentUser: string;
  /** Admin may edit any event and bypass the organizer-only lock. */
  isAdmin: boolean;
  /**
   * Event group id from the `?edit=` deep link (the event search modal's
   * "Edit" action); its edit form opens automatically once the events are
   * loaded.
   */
  initialEditEventId: string | null;
  /**
   * Event group id from the `?event=` deep link (a Google Calendar "Edit:"
   * note, the Pinned Events agenda's tap-to-open, or an event search result);
   * the event's details modal opens automatically once the fetched events
   * include a copy of the group.
   */
  initialDetailEventId: string | null;
  /**
   * The `?event=` deep link's target event, resolved by the server separately
   * from the grid's filtered `events` (only its own calendar, no type/user
   * filters). Fallback source for the details/edit deep-link lookup, so a
   * filtered-out event still opens without altering the grid or the filters.
   */
  deepLinkEvent: CalendarEvent | null;
  scheduleUsers: ScheduleUser[];
  /** Full active roster: row source when the Users filter narrows the rows. */
  allActiveUsers: ScheduleUser[];
  inviteeDepartments: { id: string; name: string; sortOrder: number; parentId: string | null }[];
  inviteeUsers: {
    id: string;
    name: string;
    shortname: string | null;
    departmentName: string | null;
    departmentSort: number | null;
    departmentId: string | null;
    departmentParentId: string | null;
    displayName: string;
  }[];
  /** Filter dialog user options: users of the selected departments + self. */
  filterUsers: {
    id: string;
    name: string;
    departmentName: string | null;
    departmentSort: number | null;
    departmentId: string | null;
    departmentParentId: string | null;
  }[];
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
 * when the viewport happens to sit over the middle of a day. This strip replaces
 * that row and pins a date label beneath the shared chrome; its inner wrapper
 * translates by -scrollLeft via a direct DOM transform and each label's `left` is
 * clamped against the per-frame `--c2-scroll-x`, so the leftmost visible day's
 * label stays anchored at the strip's left edge while its column pans through the
 * viewport and hands off at the day boundary — instead of a label that only
 * appears near a column's left edge and scrolls away, or one being swapped on a
 * day boundary (which left only one of two side-by-side dates visible). The cells
 * thinly re-render only when the label window advances (see `WEEK_DAY_WINDOW`),
 * never per frame. The strip itself is sticky under the shared tabs+date-nav
 * chrome at every breakpoint, mirroring the Week (D) day header.
 */
// Day cells are 24 slots wide, so a narrow viewport can intersect at most two
// day columns; a small fixed window around the leftmost visible day (base) is
// enough to always show the labels of the columns on screen while they pan.
const WEEK_DAY_WINDOW = 4;

function WeekDayLabelStrip({
  days,
  hasGroups,
  resourceLabelWidth,
  groupLabelWidth,
  chromeOffset,
  innerRef,
  windowChangeRef,
}: {
  days: string[];
  hasGroups: boolean;
  resourceLabelWidth: string;
  groupLabelWidth: string;
  /** Height of the sticky tabs+date-nav chrome this strip docks below. */
  chromeOffset: number;
  /** The inner day track; synced to the grid's scroll via a direct transform. */
  innerRef: RefObject<HTMLDivElement | null>;
  /** Registers this strip's window-advance callback (called on scroll/zoom). */
  windowChangeRef: RefObject<((x: number, slot: number) => void) | null>;
}) {
  // The leftmost visible day index (0-6); the rendered window follows it. Owned
  // here so a scroll frame's window update re-renders only this small strip,
  // never the whole dashboard.
  const [base, setBase] = useState(0);
  useLayoutEffect(() => {
    windowChangeRef.current = (x, slot) => {
      const next = Math.min(days.length - 1, Math.max(0, Math.floor(x / (slot * SLOTS_PER_DAY))));
      setBase((prev) => (prev === next ? prev : next));
    };
    return () => {
      windowChangeRef.current = null;
    };
  }, [windowChangeRef, days.length]);
  // The width of the sticky corner/label columns the grid scrolls beneath,
  // matching the ResourcesWeekView sizing overrides on the view itself.
  // +1px accounts for the grid root's left border so the day cells align
  // with the grid's day columns.
  const leftWidth = hasGroups
    ? `calc(${groupLabelWidth} + ${resourceLabelWidth} + 1px)`
    : `calc(${resourceLabelWidth} + 1px)`;
  const start = Math.max(0, base - 1);
  const end = Math.min(days.length - 1, start + WEEK_DAY_WINDOW - 1);
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
      <Box
        component="div"
        style={{ flex: 1, minWidth: 0, overflow: "hidden", position: "relative" }}
      >
        {/* Viewport-width wrapper, translated by -scrollLeft each frame; only
            the intersecting day cells are rendered (absolute), so the painted
            recording stays small and panning stays smooth. The wrapper itself
            must NOT clip (the parent box does): its cells sit at global day
            offsets far beyond its own box, and an overflow:hidden here would
            keep them out of the layer's paint entirely — invisible while
            panning. */}
        <Box
          ref={innerRef}
          component="div"
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            willChange: "transform",
          }}
        >
          {Array.from({ length: end - start + 1 }, (_, offset) => {
            const index = start + offset;
            const day = days[index];
            const dayObj = dayjs(day);
            const isToday = dayObj.isSame(dayjs(), "day");
            const isWeekend = dayObj.day() === 0 || dayObj.day() === 6;
            return (
              <Box
                key={day}
                component="div"
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: `calc(var(--ruler-slot, 60px) * ${SLOTS_PER_DAY * index})`,
                  width: `calc(var(--ruler-slot, 60px) * ${SLOTS_PER_DAY})`,
                  borderLeft: "1px solid var(--mantine-color-default-border)",
                }}
              >
                <Text
                  size="sm"
                  style={{
                    position: "absolute",
                    top: "50%",
                    transform: "translateY(-50%)",
                    left: `clamp(
                      0.5rem,
                      calc(var(--c2-scroll-x, 0px) - var(--ruler-slot, 60px) * ${SLOTS_PER_DAY * index} + 0.5rem),
                      calc(var(--ruler-slot, 60px) * ${SLOTS_PER_DAY} - 3rem)
                    )`,
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

// The pinned ruler + day-label strips follow the grid's pan via a transform
// on a viewport-width wrapper. Only the cells that can be visible are rendered
// (absolutely positioned, clipped by the wrapper): painting a full-height week
// of label/track cells (168 × 60px = 10080px+) into a `will-change: transform`
// layer means the browser must re-raster tiles on the fly while panning, which
// is the lag the strips showed. The rendered window keys off a coarse batch —
// re-rendering on every day/hour boundary crossing like the old index math —
// with enough cells past the batch to always cover the widest viewport.
/** Slots per batch; the rendered window advances (and re-renders) once per batch. */
const RULER_BATCH_SLOTS = 8;
/** Cells rendered per batch — must cover 2 batches + the widest viewport. */
const RULER_RENDER_SLOTS = 48;

/**
 * Pinned hour ruler for the Day and Week (H) schedule views. The library's own
 * time-labels row is sticky only inside its ScrollArea viewport, which never
 * scrolls vertically (the page does), so during page scroll the axis scrolls
 * away with the grid. This strip replaces that row: it pins beneath the shared
 * chrome (like the Week (H) day-label strip) and its inner hour track translates
 * by -scrollLeft via a direct DOM transform — no per-frame re-renders — so
 * labels stay over their columns while the grid pans horizontally, mirroring
 * the Week (D) day-header mechanics. Only the slot cells that can intersect the
 * viewport are rendered (a window that advances one batch at a time), since a
 * full-height week (168 slots) painted into a `will-change` layer re-rasters on
 * the fly and lags the pan.
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
  windowChangeRef,
}: {
  hasGroups: boolean;
  resourceLabelWidth: string;
  groupLabelWidth: string;
  chromeOffset: number;
  stackBelowHeight?: string;
  innerRef: RefObject<HTMLDivElement | null>;
  days?: number;
  /** Registers this strip's window-advance callback (called on scroll/zoom). */
  windowChangeRef: RefObject<((x: number, slot: number) => void) | null>;
}) {
  // The coarse scroll batch (in slots) that picks the rendered cell window.
  // Owned here so a scroll frame's window update re-renders only this small
  // strip, never the whole dashboard.
  const [batch, setBatch] = useState(0);
  useLayoutEffect(() => {
    windowChangeRef.current = (x, slot) => {
      const next = Math.max(0, Math.floor(x / (slot * RULER_BATCH_SLOTS)));
      setBatch((prev) => (prev === next ? prev : next));
    };
    return () => {
      windowChangeRef.current = null;
    };
  }, [windowChangeRef]);
  // The width of the sticky corner/label columns the grid scrolls beneath,
  // matching the ResourcesWeekView/ResourcesDayView sizing overrides.
  // +1px accounts for the grid root's left border so the ruler aligns with
  // the grid's slot columns.
  const leftWidth = hasGroups
    ? `calc(${groupLabelWidth} + ${resourceLabelWidth} + 1px)`
    : `calc(${resourceLabelWidth} + 1px)`;
  const totalSlots = SLOTS_PER_DAY * days;
  const first = Math.max(0, Math.min(totalSlots - 1, (batch - 1) * RULER_BATCH_SLOTS));
  const last = Math.min(totalSlots - 1, first + RULER_RENDER_SLOTS - 1);
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
        height: "calc(1.15rem * var(--mantine-scale))",
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
      <Box
        component="div"
        aria-hidden
        style={{ flex: 1, minWidth: 0, overflow: "hidden", position: "relative" }}
      >
        {/* Viewport-width wrapper, translated by -scrollLeft each frame; only
            the intersecting slot cells are rendered (absolute), so the painted
            recording stays small and the ruler tracks the pan smoothly. The
            wrapper itself must NOT clip (the parent box does): its cells sit at
            global slot offsets far beyond its own box, and an overflow:hidden
            here would keep them out of the layer's paint entirely — invisible
            while panning. */}
        <Box
          ref={innerRef}
          component="div"
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            willChange: "transform",
          }}
        >
          {Array.from({ length: last - first + 1 }, (_, offset) => {
            const slot = first + offset;
            return (
              <Box
                key={slot}
                component="div"
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: `calc(var(--ruler-slot, 60px) * ${slot})`,
                  width: "var(--ruler-slot, 60px)",
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
            );
          })}
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

/**
 * Duration of the grid swipe on a view/date change. Mirrors the CSS
 * `--c2-dur-standard` (250ms); the animation is driven through the Web
 * Animations API rather than a CSS class so restarting it needs no forced
 * reflow of the whole grid (see the slide effect in `DashboardView`).
 */
const VIEW_SLIDE_MS = 250;

export function DashboardView({
  month,
  date,
  tabs,
  activeView,
  canManageViews,
  initialZoom,
  initialGridWeekColZoom,
  initialGridWeekRowZoom,
  initialMonthZoom,
  initialDualSplit,
  events,
  calendars,
  eventTypes,
  eventTypeGroups,
  eventTitleRecipe,
  viewEventTitleRecipe,
  googleConfigured,
  quickLinks,
  selectedCalendarIds,
  selectedTypes,
  selectedUserIds,
  defaultFilters,
  currentUser,
  isAdmin,
  initialEditEventId,
  initialDetailEventId,
  deepLinkEvent,
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
  // The route is now a thin client shell (docs/pwa-offline.md): data lives in
  // DashboardScreen, which revalidates in place. Mutations call `revalidate()`
  // instead of `router.refresh()` (which no longer carries data), and a
  // context-change fetch drives the grid skeleton via `isNavigating`.
  const { revalidate, isNavigating, tabStatus, setPreviewView } = useDashboardData();
  // The active tab's renderer kind (Month/Week (H)/…). Booleans, the skeleton
  // chain and the period label key off this exactly like the old `view` prop.
  const view: ViewMode = activeView.kind;
  // Cold-start readiness: the grid content is server-rendered into this
  // component's props, so the view only mounts once the route's events have
  // streamed — reporting on mount is exactly "content painted".
  useColdStartContent();

  const theme = useMantineTheme();
  // Desktop = the theme's lg breakpoint: schedule label columns widen, the
  // week view's hour slots grow, modals get a wider size, and the "New event"
  // FAB moves into the nav row. The schedule views declare their label/slot
  // widths on the view root (inline var / styles-API var), so the override
  // lives here — a parent CSS class can't shadow the root's own declaration.
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const isDesktopWide = useMediaQuery(DESKTOP_WIDE_MEDIA_QUERY);
  const isNarrow = useMediaQuery(NARROW_MEDIA_QUERY);
  // Touch-first devices: only they get the agenda swipe hint (see below).
  const isCoarsePointer = useMediaQuery(COARSE_POINTER_MEDIA_QUERY);

  // The event wizard modal scales with the viewport: it keeps phone widths
  // (xs/sm) below the desktop band, holds md (440px) across the narrow
  // desktop band, and only widens to lg (620px) once the shell's "wide
  // desktop" band (>= 800px) frees real horizontal space. The width is a
  // pure function of the viewport — never of the active step's content — so
  // the fixed-height body keeps the step strip and Back/Next bar from moving.
  const formModalWidthPx = isNarrow ? 320 : isDesktopWide ? 620 : isDesktop ? 440 : 380;

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
  // once from the remembered cookie; `usePersistDashboardNav` below writes the
  // level back so a relaunch restores it. No render-phase sync: the user's
  // latest tap always wins, and the cookie (hence the next server seed) has
  // already converged to it.
  const [zoom, setZoom] = useState<SlotZoom>(initialZoom);
  // Tracks the previous zoom so the consolidated geometry effect (below) only
  // re-anchors the scroll on a genuine zoom change — never on mount, view
  // switches or breakpoint flips.
  const prevZoomRef = useRef(zoom);

  // Week (Grid) zoom is split into two independent levels: the day-column
  // WIDTH (slotZoom.gridWeekColumnWidth, floored at fit) and the hour-slot
  // HEIGHT (gridWeekSlotHeight). Same ownership contract as the other zooms —
  // client state seeded from the cookie, persisted back below. The grid's
  // scroll viewport is captured so each axis re-anchors its own scroll.
  const [gridWeekColZoom, setGridWeekColZoom] = useState<SlotZoom>(initialGridWeekColZoom);
  const [gridWeekRowZoom, setGridWeekRowZoom] = useState<SlotZoom>(initialGridWeekRowZoom);
  const prevGridWeekColZoomRef = useRef(gridWeekColZoom);
  const prevGridWeekRowZoomRef = useRef(gridWeekRowZoom);
  const gridWeekViewportRef = useRef<HTMLDivElement | null>(null);

  // Month-grid zoom: a multiplier of the "fit to viewport width" day columns
  // (1 = all seven days fit; the grid can never be narrower). Same ownership
  // contract as the timeline zoom: client state seeded from the cookie,
  // persisted back by `usePersistDashboardNav` below.
  const [monthZoom, setMonthZoom] = useState<MonthZoom>(initialMonthZoom);
  const prevMonthZoomRef = useRef(monthZoom);

  // Dual Pane split: the Month pane's width fraction (the Agenda pane takes
  // the rest). Same ownership contract as the zooms — client state seeded from
  // the cookie, persisted back by `usePersistDashboardNav` below. A drag
  // commits here once per gesture, never per frame: the live fraction is
  // written straight to the DOM by `DualPaneView`.
  const [dualSplit, setDualSplit] = useState<number>(initialDualSplit);

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
  // Week (Grid) zoom: independent column-width and slot-height levels.
  const gridWeekSlotHeightValue = gridWeekSlotHeight(gridWeekRowZoom);
  const gridWeekColumnWidthValue = gridWeekColumnWidth(gridWeekColZoom);

  // A deep-link target resolves from the grid's filtered `events` first (the
  // common case: it is on a selected calendar and matches the filters), then
  // from the server's separately-resolved `deepLinkEvent` (an event the active
  // filters would otherwise drop). Resolved synchronously at mount so the edit
  // form / details modal initialize without a follow-up render.
  const resolveDeepLinkEvent = (id: string | null): CalendarEvent | null => {
    if (!id) {
      return null;
    }
    return (
      events.find((event) => event.payload.eventId === id) ??
      (deepLinkEvent?.payload.eventId === id ? deepLinkEvent : null)
    );
  };

  const initialEditEvent = resolveDeepLinkEvent(initialEditEventId);

  const initialDetailEvent = resolveDeepLinkEvent(initialDetailEventId);

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
  const formIsOpen = formState !== null;
  // The "Tap outside to minimize" caption is anchored to the bottom of the
  // viewport (not the dialog's bottom), so its position never depends on the
  // dialog's measured size — resizing between wizard steps or opening the
  // modal can't make it jump.
  const hintVisible = formIsOpen && !formMinimized;
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
  // Agenda swipe hint: touch-only and shown at most once per browser session.
  // The flag is an external store over sessionStorage (see
  // `src/lib/ui/agendaSwipeHint.ts`), so it survives a reload within the
  // session and updates without a setState-in-effect.
  const agendaHintSeen = useSyncExternalStore(
    subscribeAgendaSwipeHint,
    getAgendaSwipeHintSnapshot,
    getAgendaSwipeHintServerSnapshot,
  );
  // Only touch devices see the caption, and only until the first successful
  // swipe (or a prior visit in this session) marks it seen.
  const showAgendaHint = isCoarsePointer && !agendaHintSeen;
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
  // A deep link whose target is not resolvable yet (a filtered-out event the
  // same-period refetch guard is still fetching) is held "pending" so the
  // details open when `deepLinkEvent` arrives. A manual close clears it, so a
  // closed modal is never force-reopened.
  const [pendingDetailLinkId, setPendingDetailLinkId] = useState<string | null>(
    initialDetailEventId !== null && initialDetailEvent === null ? initialDetailEventId : null,
  );
  // A stripped `event` param (the one-shot deep link is cleaned from the URL
  // after opening) should re-arm the same-id guard below, so clicking the same
  // search/pinned event again re-opens its details instead of silently no-oping.
  if (initialDetailEventId === null && prevDetailLinkId !== null) {
    setPrevDetailLinkId(null);
    setPendingDetailLinkId(null);
  }
  if (initialDetailEventId !== null && initialDetailEventId !== prevDetailLinkId) {
    setPrevDetailLinkId(initialDetailEventId);
    const found = resolveDeepLinkEvent(initialDetailEventId);
    setDetailEvent(found);
    setEditLinkFailed(found === null);
    setPendingDetailLinkId(found === null ? initialDetailEventId : null);
  }
  if (initialDetailEventId !== null && pendingDetailLinkId === initialDetailEventId) {
    const found = resolveDeepLinkEvent(initialDetailEventId);
    if (found) {
      setPendingDetailLinkId(null);
      setEditLinkFailed(false);
      setDetailEvent(found);
    }
  }
  // Same-route `?edit=` deep link (the search modal's "Edit" action opened
  // while the dashboard is already mounted): the mount-time `formState`
  // initializer above never re-runs, so re-open the edit form per new id,
  // mirroring the detail link handling above.
  const [prevEditLinkId, setPrevEditLinkId] = useState<string | null>(initialEditEventId);
  const [pendingEditLinkId, setPendingEditLinkId] = useState<string | null>(
    initialEditEventId !== null && initialEditEvent === null ? initialEditEventId : null,
  );
  if (initialEditEventId !== null && initialEditEventId !== prevEditLinkId) {
    setPrevEditLinkId(initialEditEventId);
    const found = resolveDeepLinkEvent(initialEditEventId);
    if (found) {
      setFormMinimized(false);
      setFormState({ event: found, templateEvent: null, defaultDate: found.start.slice(0, 10) });
    }
    setEditLinkFailed(found === null);
    setPendingEditLinkId(found === null ? initialEditEventId : null);
  }
  if (initialEditEventId !== null && pendingEditLinkId === initialEditEventId) {
    const found = resolveDeepLinkEvent(initialEditEventId);
    if (found) {
      setPendingEditLinkId(null);
      setEditLinkFailed(false);
      setFormMinimized(false);
      setFormState({ event: found, templateEvent: null, defaultDate: found.start.slice(0, 10) });
    }
  }
  const [filterOpened, { open: openFilter, close: closeFilter }] = useDisclosure(false);
  // Where the filter trigger sat on screen; the dialog grows out of / shrinks
  // back into it (see src/lib/motion/origin.ts).
  const [filterOriginRect, setFilterOriginRect] = useState<Rect | null>(null);
  // One-shot intent: after the Manage-views modal's per-row Filters action
  // switches tabs, open that tab's filter dialog once it is the active view
  // (its resolved filter values arrive with the tab's data).
  const [pendingFilterViewId, setPendingFilterViewId] = useState<string | null>(null);
  const [pickerOpened, { open: openPicker, close: closePicker }] = useDisclosure(false);
  // Where the date trigger sat on screen; the picker grows out of / shrinks
  // back into it (see src/lib/motion/origin.ts).
  const [pickerOriginRect, setPickerOriginRect] = useState<Rect | null>(null);

  // "Add view" dialog draft (kind picker + name).
  const [createOpened, { open: openCreateView, close: closeCreateView }] = useDisclosure(false);
  const [createKind, setCreateKind] = useState<DashboardViewKind>("month");
  const [createName, setCreateName] = useState(DASHBOARD_VIEW_KIND_LABELS.month);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // "Manage views" dialog (reorder / rename / delete). The list mutations run
  // inside `EditViewsModal`; this disclosure just hosts it.
  const [editOpened, { open: openEdit, close: closeEdit }] = useDisclosure(false);

  // Optimistic active-tab highlight (`shownTabId`): leads the server-resolved
  // `activeView` so a tab tap highlights instantly (even between two tabs of
  // the same kind) while the grid waits behind its skeleton. Render-phase
  // sync follows external prop changes — back/forward, deep links, server
  // re-renders after create/delete — and re-snaps to the committed props
  // whenever our navigation transition has ended.
  const [shownTabId, setShownTabId] = useState(activeView.id);

  // Optimistic date-nav chrome (`shown*`): leads the server-resolved props so
  // tab taps, chevrons and Today answer instantly while the grid waits behind
  // its skeleton for real data. Taps write these directly (shift*/switchTab/
  // goToday/pickDate); the render-phase sync below follows external prop
  // changes (back/forward, deep links, cold starts) and — whenever our
  // navigation transition has ended — re-snaps to the committed props,
  // healing a failed or offline navigation instead of stranding the chrome on
  // an intent that never landed. Same "adjust state during render" pattern as
  // `shownTabId` above.
  const [shownView, setShownView] = useState(view);
  const [shownMonth, setShownMonth] = useState(month);
  const [shownDate, setShownDate] = useState(date);
  const [prevNavSync, setPrevNavSync] = useState({
    tabId: activeView.id,
    view,
    month,
    date,
    isPending,
  });
  if (
    prevNavSync.tabId !== activeView.id ||
    prevNavSync.view !== view ||
    prevNavSync.month !== month ||
    prevNavSync.date !== date ||
    prevNavSync.isPending !== isPending
  ) {
    setPrevNavSync({ tabId: activeView.id, view, month, date, isPending });
    // While our transition is in flight the optimistic values stand; once it
    // ends, keep them until the held data actually answers the context
    // (`isNavigating`) — the committed month/view can still be the previous one
    // while a new month's data is read, and re-snapping would strand the chrome
    // there and drop the grid skeleton mid-load. A failed read (`isNavigating`
    // false, failed context) still heals back to the committed props.
    if (!isPending && !isNavigating) {
      setShownTabId(activeView.id);
      setShownView(view);
      setShownMonth(month);
      setShownDate(date);
    }
  }
  const shownIsAgenda = shownView === "agenda";
  const shownIsDual = shownView === "dual";
  const shownIsWeekV2 = shownView === "weekv2";
  const shownIsGridWeek = shownView === "weekgrid";
  const shownIsWeek = shownView === "week" || shownIsWeekV2 || shownIsGridWeek;
  // Day/week-anchored chrome flag mirroring `isAnchoredView`, which stays bound
  // to the committed props because it drives data rendering below. Dual Pane is
  // day-anchored too (its Month pane follows the agenda day's month).
  const shownIsAnchored =
    shownView === "schedule" || shownIsWeek || shownIsAgenda || shownIsDual;

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

  // The tab bar scrolls horizontally on narrow screens. After a tab change
  // (tab tap, `?view=` deep link, cold start) bring the active tab into view
  // if it sits outside the visible strip; a direct tap is already visible so
  // this is a no-op there. `block: "nearest"` keeps the scroll inside the
  // strip instead of moving the page vertically.
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
  }, [shownTabId]);

  // Schedule strips (Week (H) day labels + the Day/Week hour rulers) follow
  // the grid's horizontal scroll via a direct DOM transform on a small
  // viewport-width wrapper; cells are only rendered for an advance-by-window
  // (WeekDayLabelStrip / TimeRulerStrip) — never a full-height week of cells,
  // which re-rasters while panning and lags. The strips own their window state;
  // the scroll/geometry handlers push position + slot px through these registered
  // callbacks (refs, so a scroll frame triggers no DashboardView render — only
  // the small strip re-renders when its window advances a batch).
  const rulerSlotPxRef = useRef(60);
  const advanceWeekLabelRef = useRef<((x: number, slot: number) => void) | null>(null);
  const advanceWeekRulerRef = useRef<((x: number, slot: number) => void) | null>(null);
  const advanceDayRulerRef = useRef<((x: number, slot: number) => void) | null>(null);
  const weekBoxRef = useRef<HTMLDivElement | null>(null);
  // The grid/skeleton wrapper that plays the directional swipe on a view (tab)
  // switch. It stays mounted (a keyed remount would lose scroll state), so the
  // animation is restarted by toggling a class (see the layout effect below).
  const gridSlideRef = useRef<HTMLDivElement | null>(null);
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
      weekDayLabelRef.current.style.setProperty("--c2-scroll-x", `${pos.x}px`);
    }
    if (weekRulerRef.current) {
      weekRulerRef.current.style.transform = `translateX(${-pos.x}px)`;
    }
    const slot = rulerSlotPxRef.current;
    advanceWeekLabelRef.current?.(pos.x, slot);
    advanceWeekRulerRef.current?.(pos.x, slot);
  }, []);
  const handleDayScroll = useCallback((pos: { x: number }) => {
    if (dayRulerRef.current) {
      dayRulerRef.current.style.transform = `translateX(${-pos.x}px)`;
    }
    advanceDayRulerRef.current?.(pos.x, rulerSlotPxRef.current);
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
  // the MonthView's ScrollArea scroll. The grid fits the viewport width at
  // zoom 1; zooming in widens it past the viewport (overflowing the same way
  // narrow screens always did), which is when this pan applies. The strip's
  // own pan/drag + edge buttons are the month instance of useGridPan — the
  // same affordances the schedule grids get.
  const monthPan = useGridPan();
  const monthViewportRef = useRef<HTMLDivElement | null>(null);
  const monthGridViewportRef = useMergedRef(monthViewportRef, monthPan.viewportRef);
  const monthWeekdayTrackRef = useRef<HTMLDivElement | null>(null);
  const handleMonthScroll = useCallback((pos: { x: number }) => {
    if (monthWeekdayTrackRef.current) {
      monthWeekdayTrackRef.current.style.transform = `translateX(${-pos.x}px)`;
    }
  }, []);
  // Stable identity (see weekScrollAreaProps above): the MonthView must not
  // receive fresh `scrollAreaProps` objects on every scroll frame.
  const monthScrollAreaProps = useMemo(
    () => ({
      viewportRef: monthGridViewportRef,
      onScrollPositionChange: handleMonthScroll,
      viewportProps: monthPan.viewportProps,
    }),
    [handleMonthScroll, monthGridViewportRef, monthPan.viewportProps],
  );
  // Week (Grid) horizontal pan: the grid fits the viewport width at zoom <= 1;
  // zooming in widens the day columns past it, which is when this pan applies.
  // The viewport ref is merged with the vertical re-anchor ref above.
  const gridWeekPan = useGridPan();
  const { remeasure: remeasureGridWeekPan } = gridWeekPan;
  const gridWeekGridViewportRef = useMergedRef(gridWeekViewportRef, gridWeekPan.viewportRef);
  // The viewport is also the grid's **vertical** scroller: bounding it to the
  // space below the chrome turns the library's content-height ScrollArea into an
  // internal one, so its day header (sticky, top: 0) and our sticky all-day row
  // pin while the hour rows scroll — and `startScrollTime` + the row-zoom
  // re-anchor (both read the viewport's scrollTop) finally take effect. The
  // budget mirrors DualPaneView's viewport-bounded panes and subtracts
  // `--c2-weekgrid-below-pad` (the page pad / mobile FAB clearance below the
  // grid) so the page itself doesn't scroll.
  const gridWeekMaxHeight = `calc(var(--app-shell-vh, 100dvh) - var(--app-shell-header-offset) - var(--app-shell-footer-offset) - var(--app-shell-padding) - var(--c2-weekgrid-below-pad, 0px) - var(--mantine-spacing-sm) - ${chromeHeight}px)`;
  const gridWeekScrollAreaProps = useMemo(
    () => ({
      viewportRef: gridWeekGridViewportRef,
      viewportProps: gridWeekPan.viewportProps,
      style: { maxHeight: gridWeekMaxHeight },
    }),
    [gridWeekGridViewportRef, gridWeekPan.viewportProps, gridWeekMaxHeight],
  );

  // Post-mutation refresh (event create/update/delete, detail actions): the
  // shared bar reports the re-read that follows the saved state.
  const refreshAfterSave = revalidate;

  // Skeleton-only loading: the grid skeleton follows **data coverage**, not the
  // router transition — `isNavigating` is true from the instant the URL context
  // changes until the held data answers it (or the fetch fails), so it can't
  // gap around the data fetch or flash on a covered/equivalent tab switch.
  // `useMinSkeletonHold` keeps it up for a minimum ~350ms so fast (cached) loads
  // read as a deliberate sequence instead of a flash. `useContentEnter` fades
  // the grid in on the reveal; on a cold mount the class ships in the SSR HTML
  // and plays on first paint. The one-shot `edit`/`event` strips are plain
  // pushes (no transition), so they never set the pending flag and never replay
  // the fade. (Force refresh is a full page reload from the profile menu now —
  // its wait is the route loading.tsx, not this skeleton.)
  //
  // The month grid renders the committed record's month (`month`), which lags
  // the URL while a new month is read — and `isNavigating` can itself lag
  // through the router transition (its `searchParams` source updates only when
  // the RSC payload lands, so even a device-cached month would flash its
  // skeleton during that gap). When the record we already hold shares a month
  // with the destination grid (adjacent months, the usual case), draw the
  // tapped month immediately from the held events and let the read swap them in
  // place — no skeleton, no previous-month flash. A far jump (no shared month)
  // has no usable in-memory events, so it keeps the skeleton. Anchored views
  // don't need this: their `date` prop is URL-first, and a cross-month move is
  //   already `isNavigating`.
  const monthChanging = (shownView === "month" || shownView === "dual") && shownMonth !== month;
  const monthOptimistic =
    monthChanging &&
    monthGridMonths(shownMonth).some((candidate) => monthGridMonths(month).includes(candidate));
  const monthPending = monthChanging && !monthOptimistic;
  const gridLoading = useMinSkeletonHold((isNavigating && !monthOptimistic) || monthPending);
  useContentEnter(weekBoxRef, !gridLoading);

  // Directional swipe on the grid/skeleton wrapper, for two kinds of change:
  // - a view (tab) switch: the target's side in the strip picks the direction
  //   (a target earlier in the strip enters from the right, later from the left);
  // - a date move within the same view (chevron/Today/picker): forward in time
  //   enters from the right, backward from the left — matching the Agenda slide.
  // Driven by the optimistic chrome (`shown*`), so the slide starts on tap while
  // the skeleton is up (a warm switch keeps `gridLoading` false, so a
  // reveal-triggered animation would never run). The Agenda tab is excluded
  // (`slidePeriodKey` null): it owns its own inner keyed slide. A tab switch
  // takes precedence, and the date branch is suppressed while a tab transition
  // is still in flight (`shownTabId` leading `activeView.id`), so a
  // Month↔anchored switch — which also resets the date — slides only once.
  const slidePeriodKey =
    shownView === "agenda"
      ? null
      : shownView === "month" || shownView === "dual"
        ? shownMonth
        : shownDate;
  const prevSlideRef = useRef({ viewId: activeView.id, periodKey: slidePeriodKey });
  useLayoutEffect(() => {
    const prev = prevSlideRef.current;
    prevSlideRef.current = { viewId: activeView.id, periodKey: slidePeriodKey };
    let dir: 1 | -1 | 0 = 0;
    if (prev.viewId !== activeView.id) {
      dir = viewSwitchDirection(prev.viewId, activeView.id, tabs);
    } else if (shownTabId === activeView.id) {
      dir = periodSwitchDirection(prev.periodKey, slidePeriodKey);
    }
    if (dir === 0) return;
    const el = gridSlideRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Web Animations API instead of a CSS-class toggle: restarting a CSS keyframe
    // requires forcing a synchronous reflow (`void el.offsetWidth`) of the whole
    // grid, which is a layout pass over a large subtree on every tab/date change.
    // `el.animate` restarts without touching layout.
    for (const running of el.getAnimations()) {
      running.cancel();
    }
    el.animate([{ transform: `translateX(${dir * 10}%)` }, { transform: "translateX(0)" }], {
      duration: VIEW_SLIDE_MS,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    });
  }, [activeView.id, slidePeriodKey, shownTabId, tabs]);

  // Device-local "where you are": persist the resolved date/month anchor, the
  // Day/Week (H) + Month-grid zooms and the Dual Pane split to the per-device
  // cookie whenever the rendered state changes, so a cold start (or F5) lands
  // on the same period, zooms and split. The date is stored when the URL pins
  // one (day-anchored views) — and always for Dual Pane, whose agenda day is
  // its identity even before the URL carries it. In Month view the remembered
  // month drives the read. The tabs + their filters are server-side and need no
  // cookie. An in-month day move no longer refetches, so the committed `date`
  // prop lags the URL — persist the client-effective date instead.
  const effectiveDate = view === "agenda" ? (viewedDay ?? date) : shownDate;
  usePersistDashboardNav({
    ...(searchParams.has("date") || view === "dual" ? { date: effectiveDate } : {}),
    month,
    zoom,
    gridWeekColZoom,
    gridWeekRowZoom,
    monthZoom,
    dualSplit,
  });

  // Post-mutation refresh reporter for the view (tab) CRUD: renames, reorder
  // and non-active deletes re-read the route so the server renders the new tab
  // list (the activity bar covers the otherwise-invisible refresh).
  const refreshAfterViewsSave = revalidate;

  // The date shown in the agenda day modal; persists through the exit
  // animation so the shrinking box still has content.
  const agendaViewDate = agendaDate ?? displayAgendaDate;

  const viewport = {
    w: typeof window === "undefined" ? 0 : window.innerWidth,
    h: typeof window === "undefined" ? 0 : window.innerHeight,
  };
  // The agenda-day and event-form modals widen at lg (and the event form
  // again at the wide-desktop band), so each shrink-to-target scale must use
  // its own modal's matching content width.
  const agendaContentWidth = modalContentWidth(viewport, isNarrow ? 320 : isDesktop ? 440 : 380);
  const formContentWidth = modalContentWidth(viewport, formModalWidthPx);
  const agendaTransitionProps = {
    transition: {
      in: { opacity: 1, transform: "scale(1)" },
      out: {
        opacity: 0,
        transform: `scale(${scaleFromRect(agendaOriginRect, agendaContentWidth)})`,
      },
      common: { transformOrigin: transformOriginFromRect(agendaOriginRect, viewport, "center") },
      transitionProperty: "transform, opacity",
    },
    duration: MOTION.modalZoom,
    exitDuration: MOTION.modalZoomExit,
    timingFunction: "cubic-bezier(0.3, 1.2, 0.4, 1)",
  } as const;
  const formTransitionProps = {
    transition: {
      in: { opacity: 1, transform: "scale(1)" },
      out: {
        opacity: 0,
        transform: `scale(${scaleFromRect(formOriginRect, formContentWidth, 0.5)})`,
      },
      common: {
        transformOrigin: transformOriginFromRect(formOriginRect, viewport, "bottom right"),
      },
      transitionProperty: "transform, opacity",
    },
    duration: MOTION.modalForm,
    timingFunction: "ease",
  } as const;

  // Nav-row labels derive from the optimistic `shown*` chrome so the period
  // text moves the instant a control is tapped. The grid/ruler branches below
  // guard on the committed `view` too, and whenever it renders (!gridLoading)
  // the sync above guarantees shown === committed, so these never feed stale
  // values into data rendering.
  const monthLabel = dayjs(`${shownMonth}-01`).format("MMMM YYYY");
  const dayLabel = dayjs(shownDate).format("ddd, MMM D, YYYY");
  const week =
    shownView === "week" || shownView === "weekv2" || shownView === "weekgrid"
      ? weekDays(shownDate)
      : null;
  const weekLabel = week ? formatWeekLabel(week[0], week[6]) : "";
  // Dual Pane labels the nav row with the MONTH (the pane header carries the
  // agenda day), so a month move reads on the shared chrome.
  const periodLabel = shownIsAgenda
    ? dayjs(viewedDay ?? shownDate).format("ddd, MMM D, YYYY")
    : shownIsDual
      ? monthLabel
      : shownIsWeek
        ? weekLabel
        : shownIsAnchored
          ? dayLabel
          : monthLabel;

  // The name of the tab currently highlighted (optimistic during a switch);
  // drives the sr announcement so a renamed tab is announced by its name.
  const shownTabName = tabs.find((tab) => tab.id === shownTabId)?.name ?? activeView.name;

  // Screen-reader announcement of view/period changes (tab taps, chevrons,
  // Today, date picker, agenda swipes all flow through the optimistic chrome,
  // so one watcher covers them). The first render only records the baseline —
  // announcing on plain page load would be noise.
  const lastAnnouncedChromeRef = useRef<string | null>(null);
  useEffect(() => {
    // Dual Pane's period label is the month, so the agenda day is announced
    // alongside it — a day move otherwise changes nothing announced.
    const message = shownIsDual
      ? `${shownTabName} view, ${periodLabel}, ${dayLabel}`
      : `${shownTabName} view, ${periodLabel}`;
    if (lastAnnouncedChromeRef.current === null) {
      lastAnnouncedChromeRef.current = message;
      return;
    }
    if (lastAnnouncedChromeRef.current !== message) {
      lastAnnouncedChromeRef.current = message;
      announce(message);
    }
  }, [shownTabName, shownView, periodLabel, dayLabel, shownIsDual]);
  const today = dayjs().format("YYYY-MM-DD");
  const todayMonth = dayjs().format("YYYY-MM");
  // Start-scroll anchor for the Day/Week (H) timelines: when the shown period
  // contains today the grid opens at the current time, otherwise the 07:00
  // working-day default. Only consumed by the library's client mount effect
  // (never emitted to the DOM), so the client-computed value is hydration-safe.
  const currentScrollTime = dayjs().format("HH:mm:ss");

  // ---- Optimistic mutations -------------------------------------------------
  // The grid data is the server `events` prop; while a create/edit/delete runs
  // (serial Google writes, then a read-your-own-writes refresh) the client
  // renders a stand-in through these overlay ops so the grid reflects the
  // change immediately. All view memos below consume `viewEvents`, never the
  // raw prop. Design: docs/optimistic-mutations.md.
  const [optimisticOps, setOptimisticOps] = useState<OptimisticOp[]>([]);

  const applyOptimistic = useCallback((op: OptimisticOp) => {
    setOptimisticOps((current) => [...current, op]);
  }, []);
  const rollbackOptimistic = useCallback((opId: string) => {
    setOptimisticOps((current) => current.filter((op) => op.id !== opId));
  }, []);
  const settleOptimistic = useCallback((opId: string, result: EventActionOk) => {
    setOptimisticOps((current) =>
      current.map((op) => {
        if (op.id !== opId) {
          return op;
        }
        if (op.kind === "remove") {
          return { ...op, settled: true };
        }
        // Pin the stand-in to the server's group id and real copy ids so it
        // stays clickable-safe and reconciles by identity, not by placeholder.
        const copy = result.copies.find((c) => c.calendarId === op.event.payload.calendarId);
        const eventId = result.eventId ?? op.event.payload.eventId;
        return {
          ...op,
          settled: true,
          event: {
            ...op.event,
            id: `${op.event.payload.calendarId}:${eventId ?? copy?.googleEventId ?? op.event.payload.googleEventId}`,
            payload: {
              ...op.event.payload,
              eventId,
              googleEventId: copy?.googleEventId ?? op.event.payload.googleEventId,
            },
          },
        };
      }),
    );
  }, []);

  // Drop settled ops the moment an authoritative `events` prop arrives after
  // the mutation's refresh (read-your-own-writes guarantees that prop already
  // reflects the mutation, so the overlay can hand off without a flicker).
  // This is a guarded render-phase state adjustment (the codebase's standard
  // derived-state pattern — setState during render is allowed here, an effect
  // is not), so no commit ever shows the overlay over the fresh data.
  const [lastEvents, setLastEvents] = useState<readonly CalendarEvent[]>(events);
  if (events !== lastEvents) {
    setLastEvents(events);
    if (optimisticOps.some((op) => op.settled)) {
      setOptimisticOps((current) => current.filter((op) => !op.settled));
    }
  }

  const viewEvents = useMemo(
    () => applyOptimisticOps(events, optimisticOps),
    [events, optimisticOps],
  );

  // The latest merged events, so the post-save "View event" pill resolves
  // against current data. The pill stores its `onAction` in provider state, so
  // the callback it captured at submit time still closes over the pre-mutation
  // `viewEvents` (the create's new group id is absent, the edit's is stale);
  // reading this ref at click time finds the settled stand-in / authoritative
  // event instead. (Latest-ref idiom, as in AuditLogView.)
  const viewEventsRef = useRef(viewEvents);
  useEffect(() => {
    viewEventsRef.current = viewEvents;
  }, [viewEvents]);

  // Open the details modal for a just-saved event (the toast "View event"
  // action). Resolves from the optimistic overlay so it opens instantly, even
  // while the post-save refresh is still in flight; a null origin grows from
  // center (there is no chip to originate from).
  function openSavedEventDetail(eventId: string | null) {
    const found = viewEventsRef.current.find((event) => event.payload.eventId === eventId) ?? null;
    if (!found) {
      return;
    }
    setDetailOriginRect(null);
    setDetailEvent(found);
  }

  // The acting user's home department — the representative calendar a brand-new
  // optimistic event stands on until the server pins the real copy. Cosmetic:
  // the stand-in's rows come from its tagged people/departments, not this id.
  const optimisticHome = useMemo(() => {
    const user = allActiveUsers.find((row) => row.id === currentUser);
    const calendarId = user?.departmentId ?? null;
    const calendar = calendarId ? calendars.find((c) => c.id === calendarId) : null;
    return calendar ? { id: calendar.id, name: calendar.name } : null;
  }, [allActiveUsers, currentUser, calendars]);

  const filterGroups: FilterGroup[] = useMemo(() => {
    // Department picker rows: the calendars prop is already in display
    // (preorder) order; re-tree it and label each option with its full
    // ancestor chain ("HQ › Logistics"), so the hierarchy reads in the chip.
    const calendarRows = departmentTreeRows(
      calendars.map((calendar) => ({
        id: calendar.id,
        name: calendar.name,
        sortOrder: calendar.sortOrder,
        parentId: calendar.parentId,
      })),
    );
    const calendarPathLabels = departmentPathLabels(calendarRows);
    const groups: FilterGroup[] = [
      {
        label: "Calendars",
        options: calendarRows.map((row) => ({
          value: row.id,
          label: calendarPathLabels.get(row.id) ?? row.name,
        })),
      },
    ];
    const userOptions = filterUsers.map((user) => ({
      value: user.id,
      label: user.name,
      // Carries the department into the picker dialog so users render as
      // per-department badge sections instead of one flat list; the sort order
      // keeps the sections in Settings → Departments display order and the id +
      // parent id let the sections nest under their parents.
      department: user.departmentName,
      departmentSort: user.departmentSort,
      departmentId: user.departmentId,
      departmentParentId: user.departmentParentId,
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
              icon: <IconUser size={16} />,
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
        events: viewEvents,
        userFilter: selectedUserIds,
      }),
    [
      userFilterActive,
      calendars,
      scheduleDepartments,
      scheduleUsers,
      allActiveUsers,
      viewEvents,
      selectedUserIds,
    ],
  );
  // Active roster members grouped by department — the row expansion for
  // department-tagged events (a department-level event occupies every active
  // member, so it must also land in each member's cell, not just the
  // department row). Mirrors the clash occupancy model
  // (`activeMembershipsByDepartment`).
  const departmentMemberships = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const user of allActiveUsers) {
      if (!user.departmentId) {
        continue;
      }
      const list = map.get(user.departmentId);
      if (list) {
        list.push(user.id);
      } else {
        map.set(user.departmentId, [user.id]);
      }
    }
    return map;
  }, [allActiveUsers]);
  const scheduleEvents = useMemo(
    () => expandScheduleEvents(viewEvents, departmentMemberships),
    [viewEvents, departmentMemberships],
  );

  // "Highlight my entries": the events the current user is tagged on — the
  // same semantics as the Myself quick filter (the organizer counts only when
  // self-invited). Drives the per-view
  // highlights (month top rows + chip ring, agenda row tint, the resource-row
  // tint via the label marker below); see docs/dashboard-views.md §1.5.
  const myEventIds = useMemo(
    () =>
      new Set(
        viewEvents
          .filter((event) => eventMatchesUserFilter(event.payload, [currentUser]))
          .map((event) => event.id),
      ),
    [viewEvents, currentUser],
  );
  // Active department ids of the acting user — the event detail modal uses
  // this to let a member of a tagged department edit (mirrors the server guard).
  const myActiveDepartmentIds = useMemo(
    () =>
      allActiveUsers
        .filter((user) => user.id === currentUser)
        .flatMap((user) => (user.departmentId ? [user.departmentId] : [])),
    [allActiveUsers, currentUser],
  );
  // The month grid assigns each day's rows greedily in input order, so feed
  // the user's events first (each block time-sorted) and they claim the top
  // rows of every day.
  const monthEvents = useMemo(
    () => sortMineFirst(viewEvents, myEventIds),
    [viewEvents, myEventIds],
  );

  // External flag from the underlying CalendarEvent payload (Mantine's
  // renderEvent type only knows `id`). External events get the purple
  // highlight classes (docs/dashboard-views.md §1.6); the styling lives in
  // globals.css, next to the amber "mine" rules.
  const isExternalRenderEvent = (event: { id: string | number }) =>
    (event as unknown as CalendarEvent).payload?.external === true;

  // renderEvent replacements for Month + Agenda: the same default root, plus
  // highlight classes on the user's events (amber) and external events
  // (purple). Month: c2-my-event = amber ring / c2-ext-event = purple ring
  // around the chip (also in the "+N more" popup). Agenda: c2-my-agenda-event
  // = amber bar/tint + bold title, c2-ext-agenda-event = the purple version.
  const renderMyMonthEvent: MyEventRender = useCallback(
    (event, props) => {
      if (!myEventIds.has(String(event.id)) && !isExternalRenderEvent(event)) {
        return <UnstyledButton {...props} />;
      }
      const extra = [
        myEventIds.has(String(event.id)) && "c2-my-event",
        isExternalRenderEvent(event) && "c2-ext-event",
      ]
        .filter(Boolean)
        .join(" ");
      return <UnstyledButton {...props} className={`${props.className ?? ""} ${extra}`.trim()} />;
    },
    [myEventIds],
  );
  const renderMyAgendaEvent: MyEventRender = useCallback(
    (event, props) => {
      if (!myEventIds.has(String(event.id)) && !isExternalRenderEvent(event)) {
        return <UnstyledButton {...props} />;
      }
      const extra = [
        myEventIds.has(String(event.id)) && "c2-my-agenda-event",
        isExternalRenderEvent(event) && "c2-ext-agenda-event",
      ]
        .filter(Boolean)
        .join(" ");
      return <UnstyledButton {...props} className={`${props.className ?? ""} ${extra}`.trim()} />;
    },
    [myEventIds],
  );

  // Day / Week (H) schedule events: the same pass-through root, plus
  // c2-ext-slot-event on external events. The purple ring styles the chip
  // element inside the root (the ScheduleEvent inner box for timed events and
  // Week (H) all-day bars; the all-day sticky-title Box in the Day view), so
  // no structural re-render is needed here.
  const renderScheduleEvent: MyEventRender = useCallback((event, rootProps) => {
    if (!isExternalRenderEvent(event)) {
      return <UnstyledButton {...rootProps} />;
    }
    return (
      <UnstyledButton
        {...rootProps}
        className={`${rootProps.className ?? ""} c2-ext-slot-event`.trim()}
      />
    );
  }, []);

  const isWeekV2 = view === "weekv2";
  const isGridWeek = view === "weekgrid";
  const isWeek = view === "week" || isWeekV2 || isGridWeek;
  const isSchedule = view === "schedule";
  const isAgenda = view === "agenda";
  const isDual = view === "dual";
  // Day/week-anchored views (Day, Week (H), Week (D), Week (Grid), Agenda,
  // Dual Pane): a `?date=` anchor drives the fetch and the rendered grid (the
  // week kinds show the Monday-first week containing the anchor day; Dual Pane
  // shows that day's month + the day's agenda). `isWeek` includes Week (D) and
  // Week (Grid).
  const isAnchoredView = isSchedule || isWeek || isAgenda || isDual;

  // Month-grid zoom knob. Mantine sizes every day column as a percentage of
  // the week row, which fills the ScrollArea content (`monthViewInner`), so
  // widening that content by the zoom multiplier widens all columns and events
  // alike (no JS geometry) and pushes the grid past the viewport into the
  // horizontal pan. 100% = all seven days fit the viewport width; the
  // `--min-day-width` floor is zeroed so columns may go below Mantine's 84px
  // on narrow screens. The same width drives the pinned weekday strip
  // (MonthWeekdayStrip) so initials track the columns.
  const monthViewInnerStyle = useMemo(
    () =>
      ({
        width: `${monthZoom * 100}%`,
        "--min-day-width": "0px",
      }) as CSSProperties,
    [monthZoom],
  );

  const buildParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      return params;
    },
    [searchParams],
  );

  const buildHref = useCallback(
    (updates: Record<string, string | null>) => {
      const query = buildParams(updates).toString();
      return query ? `${pathname}?${query}` : pathname;
    },
    [buildParams, pathname],
  );

  const navigate = useCallback(
    (updates: Record<string, string | null>) => {
      const query = searchParams.toString();
      const currentHref = query ? `${pathname}?${query}` : pathname;
      const plainHref = buildHref(updates);
      // A no-op navigation (e.g. tapping the already-active tab, or "Today"
      // while already there) would still run a transition, flashing the grid
      // skeleton for nothing.
      if (plainHref === currentHref) {
        return;
      }
      startTransition(() => {
        router.push(plainHref);
      });
    },
    [buildHref, router, startTransition, pathname, searchParams],
  );

  // A data-neutral URL update — an in-month day/week move. A plain push, never a
  // transition, so `isPending` stays false and no skeleton flashes. The month
  // set is unchanged, so `DashboardScreen` performs no read; the date anchors
  // (chrome + cookie) update locally and the cross-month case still fetches and
  // shows the skeleton via `isNavigating`.
  const navigateLocal = useCallback(
    (updates: Record<string, string | null>) => {
      const query = searchParams.toString();
      const currentHref = query ? `${pathname}?${query}` : pathname;
      const plainHref = buildHref(updates);
      if (plainHref === currentHref) {
        return;
      }
      router.push(plainHref);
    },
    [buildHref, router, pathname, searchParams],
  );

  // Warm the client-router cache for every tab's target URL, so a tap's
  // `router.push` is served instantly (and `useSearchParams` catches up, letting
  // the optimistic preview clear). The data itself is already warm from the
  // preload; this only warms the route. Skipped while a one-shot deep-link
  // param is in the URL (its href is never a real cache key). Best-effort.
  const prefetchedHrefsRef = useRef("");
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    if (searchParams.has("event") || searchParams.has("edit") || searchParams.has("refresh")) {
      return;
    }
    const hrefs: string[] = [];
    for (const tab of tabs) {
      if (tab.id === activeView.id) {
        continue;
      }
      hrefs.push(buildHref(tabSwitchTarget(tab, { view, shownDate, today })));
    }
    const signature = hrefs.join("|");
    if (signature === prefetchedHrefsRef.current) {
      return;
    }
    prefetchedHrefsRef.current = signature;
    for (const href of hrefs) {
      router.prefetch(href);
    }
  }, [router, tabs, buildHref, view, shownDate, today, activeView.id, searchParams]);

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

  // Strip the one-shot `event` param (Google Calendar note / search / Pinned
  // deep link, plus the `_eventCal` that rides alongside it) so a
  // refresh/back doesn't silently re-open the details modal. Re-arms when the
  // param is gone, so clicking the same event again strips it again —
  // otherwise a leftover `?event=` would keep re-opening the details on later
  // day/month navigation.
  const detailParamClearedRef = useRef(false);
  useEffect(() => {
    if (!initialDetailEventId) {
      detailParamClearedRef.current = false;
      return;
    }
    if (detailParamClearedRef.current) {
      return;
    }
    detailParamClearedRef.current = true;
    router.push(buildHref({ event: null, _eventCal: null }));
  }, [buildHref, initialDetailEventId, router]);

  // Shifts compose on the optimistic chrome values (not the committed props),
  // so rapid taps during a pending navigation accumulate instead of being
  // eaten by navigate()'s no-op guard.
  function shiftMonth(delta: number) {
    const next = dayjs(`${shownMonth}-01`).add(delta, "month").format("YYYY-MM");
    setShownMonth(next);
    navigate({ month: next, date: null });
  }

  function shiftDay(delta: number) {
    const next = dayjs(shownDate).add(delta, "day");
    setShownDate(next.format("YYYY-MM-DD"));
    setShownMonth(next.format("YYYY-MM"));
    navigateLocal({ date: next.format("YYYY-MM-DD"), month: next.format("YYYY-MM") });
  }

  function shiftWeek(delta: number) {
    const next = dayjs(shownDate).add(delta, "week");
    setShownDate(next.format("YYYY-MM-DD"));
    setShownMonth(next.format("YYYY-MM"));
    navigateLocal({ date: next.format("YYYY-MM-DD"), month: next.format("YYYY-MM") });
  }

  /**
   * Dual Pane month move (the nav-row chevrons). The shared anchor is the
   * agenda day, so a month step keeps the day-of-month (dayjs clamps overflow —
   * Jan 31 → Feb 28) and the Month pane follows. It changes the required month
   * set, so it is a data navigation (`navigate`, like `shiftMonth`).
   */
  function shiftDualMonth(delta: number) {
    const next = dayjs(shownDate).add(delta, "month");
    const nextDate = next.format("YYYY-MM-DD");
    const nextMonth = next.format("YYYY-MM");
    setShownDate(nextDate);
    setShownMonth(nextMonth);
    navigate({ date: nextDate, month: nextMonth });
  }

  /** Commit a Dual Pane split (drag end, keyboard step or double-click reset). */
  function handleSplitCommit(pct: number) {
    setDualSplit(clampDualSplit(pct) ?? DUAL_SPLIT_DEFAULT);
  }

  /**
   * Tab-bar taps land here. Tabs are on-demand instances (server rows, see
   * src/lib/dashboardViews) so switching carries `?view=<tab id>`; the period
   * follows the KIND transition (each tab of a kind renders the same engine):
   * - same kind (two Month tabs, two Agenda tabs) or two day-anchored kinds
   *   (Day → Week (H) …) keeps the current date — a tab switch is a
   *   filter/context change, never a date reset;
   * - leaving Month for an anchored kind starts on today (Month has no day
   *   anchor to carry over);
   * - leaving an anchored kind for Month keeps the anchor's month.
   * The tab's own filters are read server-side on the next render, so no
   * filter params travel in the URL.
   */
  function switchTab(
    tab: Pick<DashboardViewTab, "id" | "kind">,
    options?: { force?: boolean },
  ) {
    // Optimistic data switch: the data layer resolves the tapped tab
    // immediately, so a warm tab paints without waiting for the URL/RSC
    // round-trip (`useSearchParams` only updates when the payload lands).
    setPreviewView(tab.id);
    const mode = tab.kind;
    const target = tabSwitchTarget(tab, { view, shownDate, today });
    if (mode === "agenda") {
      // A fresh entry re-follows the URL (the render-phase sync above
      // re-seeds viewedDay) and plays the reveal fade, not a stale slide.
      setViewedDay(null);
      setAgendaUrlBase(null);
      setAgendaSlideDir(0);
    } else if (isAgenda) {
      // Leaving the Agenda tab drops the local day so a later entry seeds it
      // cleanly instead of resurrecting a stale view or a half-committed URL.
      setViewedDay(null);
      setAgendaUrlBase(null);
    }
    setShownTabId(tab.id);
    // Force the re-read when the held tab list can't cover the target: a newly
    // created / unknown id, a CRUD navigation (`force`), or the active tab
    // re-rendered under a new kind (the request key `viewId|months` is
    // definition-blind). Without it the keyed fetch treats the target as already
    // covered and the change would not apply until a Force refresh. Use the
    // target period (not the not-yet-committed URL) so the fetch matches the
    // href the navigation is about to push.
    if (tabSwitchNeedsReload({ target: tab, activeView, tabs, force: options?.force })) {
      const params = buildParams(target);
      // A definition reload is not a Google force-refresh.
      params.delete("refresh");
      revalidate({ params });
    }
    if (mode === "month") {
      if (view === "month") {
        // Month → Month: keep the shown month.
        navigate(target);
      } else {
        // Anchored → Month: keep the currently viewed month.
        const anchorMonth = shownDate.slice(0, 7);
        setShownView("month");
        setShownMonth(anchorMonth);
        navigate(target);
      }
      return;
    }
    if (view === "month") {
      // Month → anchored: start on today (the chrome flips before the fetch
      // resolves; the server derives the month from the date).
      setShownView(mode);
      setShownDate(today);
      setShownMonth(todayMonth);
      navigate(target);
      return;
    }
    if (mode !== view) {
      // Anchored → different anchored kind: keep the anchor day.
      setShownView(mode);
      navigate(target);
      return;
    }
    // Same kind, anchored (Day → Day, Agenda → Agenda): keep the current day.
    navigate(target);
  }

  function goToday() {
    if (isAgenda) {
      applyAgendaDay(today);
      return;
    }
    if (isAnchoredView) {
      setShownDate(today);
      setShownMonth(todayMonth);
      navigateLocal({ date: today, month: todayMonth });
    } else {
      setShownMonth(todayMonth);
      navigate({ month: todayMonth, date: null });
    }
  }

  function pickDate(picked: string) {
    setShownDate(picked);
    setShownMonth(picked.slice(0, 7));
    navigateLocal({ date: picked, month: picked.slice(0, 7) });
  }

  function pickMonth(picked: string) {
    setShownMonth(picked);
    navigate({ month: picked, date: null });
  }

  /**
   * Applies a day change in the Agenda tab. The viewed day and the slide
   * direction update locally and immediately; `?date=` is kept in sync — with
   * a plain no-transition push in-month (no new fetch identity, so the page
   * re-renders silently behind the slide) or a data navigation across a month
   * edge (skeleton + reveal fade, no slide). External URL changes
   * (back/forward, deep links) reach the tab through the URL-first `date`
   * prop, which the render-phase sync above follows.
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
    // (same pattern as the ?edit=/?event= URL strips), so no skeleton.
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

  /**
   * Opens the agenda day modal fresh from a tapped day cell (the Month view's
   * cell tap, reused by Month & Agenda below `lg` where the agenda pane is
   * hidden): a fresh open animates with the modal itself, not a day slide.
   */
  function openDayModal(day: string, origin: Rect) {
    setAgendaOriginRect(origin);
    setAgendaSlideDir(0);
    setAgendaDate(day);
  }

  const swipedRef = useRef(false);
  // One-shot click suppression for the swipe gesture: a swipe arms `swipedRef`,
  // and the wrappers' `onClickCapture` swallows the synthesized click a mouse
  // drag emits. Touch swipes (and mouse drags released outside the wrapper)
  // emit no such click, so the flag would stay armed and eat the *next* real
  // tap. Clearing it on every new pointer-down re-arms suppression for the
  // drag's own click without ever swallowing a later tap.
  const resetSwipeSuppression = useCallback(() => {
    swipedRef.current = false;
  }, []);
  const { ref: agendaSwipeRef } = useDrag<HTMLDivElement>(
    (state) => {
      if (!state.last || state.canceled || state.tap) return;
      if (Math.abs(state.movement[0]) < DAY_SWIPE_THRESHOLD) return;
      swipedRef.current = true;
      markAgendaSwipeHintSeen();
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
      markAgendaSwipeHintSeen();
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

  /**
   * Map an applied filter group onto its stored form. A selection that equals
   * the role default is stored as `null` ("role default"), so a department
   * added later automatically appears — an explicit array (incl. a genuine
   * empty one) is stored verbatim.
   */
  function overrideFor(key: keyof DashboardTabFilters, selected: string[]): string[] | null {
    const def = defaultFilters[key] ?? [];
    return selected.length === def.length && selected.every((id) => def.includes(id))
      ? null
      : selected;
  }

  /**
   * Persist the ACTIVE tab's filters server-side, then re-render from the
   * server so the events refetch under the new filter set (the grid shows its
   * skeleton through the refresh transition). Filters are per-tab rows now —
   * they never travel in the URL.
   */
  async function persistFilters(overrides: DashboardTabFilters): Promise<boolean> {
    const result = await saveDashboardViewFilters(activeView.id, overrides);
    if (!result.ok) {
      notifications.show({ color: "red", message: result.error });
      return false;
    }
    // A filter apply is a view load: no global activity bar — the active tab's
    // loading bar (and the in-place event swap) carry it.
    revalidate({ report: false });
    return true;
  }

  async function handleApplyFilters(
    values: Record<string, string[]>,
    { cleared }: { cleared: boolean },
  ) {
    const cals = values.Calendars ?? [];
    const users = values.Users ?? [];
    const types = values["Event Types"] ?? [];
    announce(filterCountMessage(cals.length, users.length, types.length));
    // Await the server write so the dialog's Apply button keeps its spinner up
    // through it; the follow-up read runs fire-and-forget and is carried by the
    // active tab's loading bar (docs/loading-transitions.md §1.13.2).
    // "Clear" (then Apply) restores the role defaults (NULL) — NOT an explicit
    // empty array, which the server deliberately resolves to "no events". Only
    // an explicit Deselect All reaches the empty-array case below.
    await persistFilters(
      cleared
        ? { cal: null, users: null, types: null }
        : {
            cal: overrideFor("cal", cals),
            users: overrideFor("users", users),
            types: overrideFor("types", types),
          },
    );
  }

  function clearFilters() {
    // Role-default overrides (null): non-admins fall back to their own
    // department's calendar.
    void persistFilters({ cal: null, users: null, types: null });
    announce("Filters cleared");
  }

  /**
   * The Manage-views modal's per-row Filters action: close the modal, switch to
   * that view, and open its filter dialog once it is the active view. Filters
   * resolve server-side per tab, so the dialog must wait for the target tab's
   * data (preloaded tabs resolve immediately) before showing its values.
   */
  function handleEditFilters(tab: DashboardViewTab) {
    closeEdit();
    if (tab.id === activeView.id) {
      setFilterOriginRect(null);
      openFilter();
      return;
    }
    setPendingFilterViewId(tab.id);
    switchTab(tab);
  }

  useEffect(() => {
    if (pendingFilterViewId !== null && activeView.id === pendingFilterViewId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPendingFilterViewId(null);
      setFilterOriginRect(null);
      openFilter();
    }
  }, [pendingFilterViewId, activeView.id, openFilter]);

  // ---- On-demand view (tab) CRUD ------------------------------------------
  // The strip's "+" opens the quick "Add view" dialog below. The Manage-views
  // modal owns reorder / edit / delete (its Edit dialog also opens the per-view
  // filter flow) and reports back via `onMutated` / `onNavigateToView` /
  // `onEditFilters`; its Add-view button reuses the quick dialog. Hidden
  // entirely for accounts without stored views (canManageViews false).

  async function submitCreateView() {
    if (creating) {
      return;
    }
    setCreating(true);
    try {
      const result = await createDashboardView({ viewType: createKind, name: createName });
      if (!result.ok) {
        setCreateError(result.error);
        return;
      }
      if (!result.id) {
        setCreateError("Could not create the view");
        return;
      }
      closeCreateView();
      // Force a server re-read: the new tab's id is unknown to the held tab
      // list, so the definition-blind request key would treat it as already
      // covered and the new tab would not appear until a Force refresh.
      switchTab({ id: result.id, kind: createKind }, { force: true });
    } finally {
      setCreating(false);
    }
  }

  /** Pick a kind in the Add-view dialog; names that still equal the previous
   *  kind's default follow along, a custom name is kept. */
  function pickCreateKind(kind: DashboardViewKind) {
    if (createName === DASHBOARD_VIEW_KIND_LABELS[createKind]) {
      setCreateName(DASHBOARD_VIEW_KIND_LABELS[kind]);
    }
    setCreateKind(kind);
    setCreateError(null);
  }

  /** Open the "Add view" dialog with fresh defaults. */
  function openAddView() {
    setCreateKind("month");
    setCreateName(DASHBOARD_VIEW_KIND_LABELS.month);
    setCreateError(null);
    openCreateView();
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
  // re-entry after leaving the tab) wins and drops any stale slide direction;
  // while one of our own writes is still in flight (the prop still holds the
  // pre-write value) the local day is kept.
  if (isAgenda) {
    if (viewedDay === null) {
      setViewedDay(date);
    } else if (viewedDay !== date) {
      if (agendaUrlBase === null || date !== agendaUrlBase) {
        setViewedDay(date);
        if (agendaSlideDir !== 0) {
          setAgendaSlideDir(0);
        }
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
  const agendaTabEvents = useMemo(
    () => eventsOnDay(viewEvents, headerDate),
    [viewEvents, headerDate],
  );
  const agendaModalEvents = useMemo(
    () => (agendaViewDate ? eventsOnDay(viewEvents, agendaViewDate) : []),
    [viewEvents, agendaViewDate],
  );
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
    rulerSlotPxRef.current = slot;

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
    // runs after the write) and advance their rendered-cell windows to the new
    // position (a zoom changes the slot width, so the day/batch indices shift).
    const ruler = isWeekGrid ? weekRulerRef.current : dayRulerRef.current;
    if (ruler) {
      ruler.style.transform = `translateX(${-viewport.scrollLeft}px)`;
    }
    if (isWeekGrid && weekDayLabelRef.current) {
      weekDayLabelRef.current.style.transform = `translateX(${-viewport.scrollLeft}px)`;
      weekDayLabelRef.current.style.setProperty("--c2-scroll-x", `${viewport.scrollLeft}px`);
    }
    if (isWeekGrid) {
      advanceWeekLabelRef.current?.(viewport.scrollLeft, slot);
      advanceWeekRulerRef.current?.(viewport.scrollLeft, slot);
    } else {
      advanceDayRulerRef.current?.(viewport.scrollLeft, slot);
    }
  }, [view, gridLoading, isSchedule, isDesktop, zoom, scheduleResources]);

  // Month-grid zoom re-anchor: widening the grid (monthViewInnerStyle above)
  // would otherwise keep the scroll offset fixed, so the columns visibly jump
  // away from the viewport center. Re-anchor `scrollLeft` so the column under
  // the viewport's center stays centered, mirroring the schedule timeline zoom
  // (reanchorScrollLeft with no label column: the scale ratio is just
  // oldZoom→newZoom — the per-day width is (viewportWidth × zoom) / 7, which
  // cancels out of the ratio). Only on a genuine zoom change — never on mount,
  // month navigation or breakpoint flips.
  useLayoutEffect(() => {
    const zoomChanged = prevMonthZoomRef.current !== monthZoom;
    const oldZoom = prevMonthZoomRef.current;
    prevMonthZoomRef.current = monthZoom;
    if (!zoomChanged || view !== "month" || gridLoading) {
      return;
    }
    const viewport = monthViewportRef.current;
    if (!viewport || viewport.clientWidth <= 0) {
      return;
    }
    const width = viewport.clientWidth;
    viewport.scrollLeft = reanchorScrollLeft(
      viewport.scrollLeft,
      width,
      0,
      (width * oldZoom) / 7,
      (width * monthZoom) / 7,
    );
  }, [view, gridLoading, monthZoom]);

  // Week (Grid) row-zoom re-anchor: the zoom changes the hour-row height, so
  // the vertical scroll would otherwise keep the same pixel offset and visibly
  // jump the time. Keep the time under the viewport's center centered, scaling
  // the offset by the zoom ratio (no label column on the vertical axis). Only
  // on a genuine zoom change — never on mount or view switches.
  useLayoutEffect(() => {
    const zoomChanged = prevGridWeekRowZoomRef.current !== gridWeekRowZoom;
    const oldZoom = prevGridWeekRowZoomRef.current;
    prevGridWeekRowZoomRef.current = gridWeekRowZoom;
    if (!zoomChanged || view !== "weekgrid" || gridLoading) {
      return;
    }
    const viewport = gridWeekViewportRef.current;
    if (!viewport || viewport.clientHeight <= 0) {
      return;
    }
    viewport.scrollTop = reanchorScrollTop(
      viewport.scrollTop,
      viewport.clientHeight,
      oldZoom,
      gridWeekRowZoom,
    );
  }, [view, gridLoading, gridWeekRowZoom]);

  // Week (Grid) column-zoom re-anchor: widening the day columns would otherwise
  // keep the same scrollLeft, so the day under the viewport's center drifts.
  // Keep it centered, scaling by the column-width ratio and accounting for the
  // fixed slot-label column the day timeline starts after (probed from the DOM
  // like the ruler effect). Only on a genuine column-zoom change.
  useLayoutEffect(() => {
    const zoomChanged = prevGridWeekColZoomRef.current !== gridWeekColZoom;
    const oldZoom = prevGridWeekColZoomRef.current;
    prevGridWeekColZoomRef.current = gridWeekColZoom;
    if (!zoomChanged || view !== "weekgrid" || gridLoading) {
      return;
    }
    const viewport = gridWeekViewportRef.current;
    const box = weekBoxRef.current;
    if (!viewport || !box || viewport.clientWidth <= 0) {
      return;
    }
    const root = Array.from(box.children).find(
      (child) => getComputedStyle(child).getPropertyValue("--week-view-slots-label-width").trim() !== "",
    );
    const labelWidth = root
      ? measuredWidth(root, "var(--week-view-slots-label-width)")
      : 0;
    const width = viewport.clientWidth;
    viewport.scrollLeft = reanchorScrollLeft(
      viewport.scrollLeft,
      width,
      labelWidth,
      oldZoom,
      gridWeekColZoom,
    );
  }, [view, gridLoading, gridWeekColZoom]);

  // The grid week's width zoom changes the scroll content's width, which the
  // pan hook's ResizeObserver (watching the viewport's own box) can't see — so
  // refresh the edge flags here, after the new width has committed, so the pan
  // arrows appear/disappear with the zoom. Also covers the view becoming active.
  useLayoutEffect(() => {
    if (view === "weekgrid" && !gridLoading) {
      remeasureGridWeekPan();
    }
  }, [view, gridLoading, gridWeekColZoom, remeasureGridWeekPan]);

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
          borderBottom: "1px solid var(--mantine-color-default-border)",
        }}
      >
        {/* View tabs stay visible in fullscreen — they (plus the trailing
            Add-view button, the "All views" jump list and the Manage-views
            gear) are the dashboard's own chrome, not the shell chrome immersive
            mode hides. The + is the last item INSIDE the horizontal scroll
            strip and opens the Add-view dialog; the "All views" and gear
            controls sit to the RIGHT of the strip, outside the scroll area, and
            the gear opens the Manage-views modal (add / reorder / rename /
            delete — see below). */}
        <Group
          align="center"
          wrap="nowrap"
          gap={0}
          style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}
        >
          <Box style={{ flex: 1, minWidth: 0 }}>
            <Tabs
              value={shownTabId}
              onChange={(next) => {
                if (!next) return;
                const tab = tabs.find((candidate) => candidate.id === next);
                if (tab) switchTab(tab);
              }}
              aria-label="Calendar view"
              styles={{ tab: { flex: "0 0 auto" } }}
            >
              <Tabs.List ref={tabListElRef} style={{ flexWrap: "nowrap", overflowX: "auto" }}>
                {tabs.map((tab) => {
                  const meta = VIEW_TAB_META[tab.kind];
                  // Per-view load state (docs/loading-transitions.md §1.13.2):
                  // fresh = solid; loading = a sweeping amber bar pinned to the
                  // tab's bottom edge (the active tab's own read, or a
                  // background preload); not-loaded = static text fade. The bar
                  // is absolutely positioned, so the tab is its positioning
                  // context (and clips it to the tab's rounded edge).
                  const status = tabStatus[tab.id] ?? "fresh";
                  return (
                    <Tabs.Tab
                      key={tab.id}
                      value={tab.id}
                      title={tab.name}
                      aria-busy={status === "loading" || undefined}
                      style={{ position: "relative", overflow: "hidden" }}
                    >
                      <Group
                        gap="xs"
                        justify="center"
                        wrap="nowrap"
                        className={status === "not-loaded" ? "c2-tab-not-loaded" : undefined}
                        style={{ minWidth: 0 }}
                      >
                        {meta.icon}
                        <Text
                          fw={600}
                          size="sm"
                          title={tab.name}
                          style={{
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {tab.name}
                        </Text>
                      </Group>
                      {status === "loading" && <span className="c2-tab-load-bar" aria-hidden />}
                    </Tabs.Tab>
                  );
                })}
                {/* Trailing "Add view" affordance: the last item in the
                    scrolling strip, so creating a view is one tap — it opens
                    the Add-view dialog directly, no trip through the
                    Manage-views modal. `role="presentation"` keeps the button
                    out of the tablist's direct children. */}
                {canManageViews && (
                  <Box
                    component="span"
                    role="presentation"
                    style={{ display: "inline-flex", alignItems: "center" }}
                  >
                    <Tooltip
                      label="Add view"
                      position="bottom"
                      events={{ hover: true, focus: true, touch: true }}
                    >
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        size={36}
                        ml={4}
                        aria-label="Add view"
                        title="Add view"
                        onClick={openAddView}
                        style={{ flex: "0 0 auto" }}
                      >
                        <IconPlus size={18} />
                      </ActionIcon>
                    </Tooltip>
                  </Box>
                )}
              </Tabs.List>
            </Tabs>
          </Box>
          {/* Quick "All views" jump list: with many content-sized tabs the
                strip overflows into a long horizontal scroll, so this menu
                lists every tab (kind icon + name, the active one ticked) for
                a one-tap switch — no scrolling the strip. */}
          {canManageViews && tabs.length > 1 && (
            <Menu
              shadow="md"
              width={240}
              position="bottom-end"
              withinPortal
              transitionProps={{
                transition: "pop-top-right",
                duration: MOTION.popover,
                timingFunction: "ease",
              }}
              styles={{
                dropdown: { maxHeight: "min(60vh, 380px)", overflowY: "auto" },
              }}
            >
              <Menu.Target>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size={36}
                  ml={4}
                  aria-label="All views"
                  title="All views"
                  style={{ flex: "0 0 auto" }}
                >
                  <IconChevronDown size={18} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                {tabs.map((tab) => {
                  const meta = VIEW_TAB_META[tab.kind];
                  const isActive = tab.id === shownTabId;
                  return (
                    <Menu.Item
                      key={tab.id}
                      leftSection={meta.icon}
                      rightSection={isActive ? <IconCheck size={14} aria-hidden /> : undefined}
                      role="menuitemradio"
                      aria-checked={isActive}
                      onClick={() => switchTab(tab)}
                    >
                      <Text
                        size="sm"
                        fw={isActive ? 700 : 500}
                        truncate
                        title={tab.name}
                        style={{ maxWidth: 160 }}
                      >
                        {tab.name}
                      </Text>
                    </Menu.Item>
                  );
                })}
              </Menu.Dropdown>
            </Menu>
          )}
          {canManageViews && (
            <Tooltip
              label="Manage views"
              position="bottom"
              events={{ hover: true, focus: true, touch: true }}
            >
              <ActionIcon
                variant="subtle"
                color="gray"
                size={36}
                ml={4}
                mr={4}
                aria-label="Manage views"
                title="Manage views"
                onClick={openEdit}
                style={{ flex: "0 0 auto" }}
              >
                <IconSettings size={18} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>

        {/* Date navigation: pinned together with the tabs above so the period
            label and prev/next stay reachable while the grid scrolls. Kept
            compact (36px controls) — it is part of the permanently visible
            chrome on every breakpoint. */}
        <Group align="center" gap="xs" wrap="nowrap" mt="xs">
          <Text
            fw={600}
            size="md"
            lineClamp={1}
            style={{ flex: 1, minWidth: 0, textAlign: "left" }}
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
            aria-label={
              shownIsWeek
                ? "Previous week"
                : shownIsDual
                  ? "Previous month"
                  : shownIsAnchored
                    ? "Previous day"
                    : "Previous month"
            }
            onClick={() =>
              isAgenda
                ? applyAgendaDay(dayjs(headerDate).add(-1, "day").format("YYYY-MM-DD"))
                : isWeek
                  ? shiftWeek(-1)
                  : isDual
                    ? shiftDualMonth(-1)
                    : isAnchoredView
                      ? shiftDay(-1)
                      : shiftMonth(-1)
            }
          >
            <IconChevronLeft size={18} />
          </ActionIcon>
          <ActionIcon
            size={36}
            variant="default"
            aria-label={
              shownIsWeek
                ? "Next week"
                : shownIsDual
                  ? "Next month"
                  : shownIsAnchored
                    ? "Next day"
                    : "Next month"
            }
            onClick={() =>
              isAgenda
                ? applyAgendaDay(dayjs(headerDate).add(1, "day").format("YYYY-MM-DD"))
                : isWeek
                  ? shiftWeek(1)
                  : isDual
                    ? shiftDualMonth(1)
                    : isAnchoredView
                      ? shiftDay(1)
                      : shiftMonth(1)
            }
          >
            <IconChevronRight size={18} />
          </ActionIcon>
          {/* Desktop: the "New event" FAB lives in the nav row instead of the
            bottom corner (the FAB is hidden at lg, below). */}
          <Button
            visibleFrom="lg"
            __vars={{ "--button-height": "36px" }}
            leftSection={<IconPlus size={16} />}
            disabled={!googleConfigured}
            onClick={(e) =>
              openCreate(
                isAgenda ? headerDate : isDual ? shownDate : today,
                e.currentTarget.getBoundingClientRect(),
              )
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
          {/* Filters live in their own primary affordance (icon + count badge).
              Date/Today navigation sits in the combined calendar button next
              door; the fullscreen toggle is a floating button on the calendar
              (Force refresh lives in the profile menu). */}
          <FilterButton
            activeCount={activeFilterCount}
            onClick={(e) => {
              setFilterOriginRect(e.currentTarget.getBoundingClientRect());
              openFilter();
            }}
            size={36}
            iconSize={18}
          />
          {/* Date + Today combined: a single calendar button (the old kebab's
              slot) opens the view-aware date selector, which also carries the
              "Today" action. The fullscreen toggle moved to a floating button
              on the calendar (FullscreenToggle, below). */}
          <ActionIcon
            size={36}
            variant="default"
            aria-label="Select date"
            title="Select date"
            onClick={(e) => {
              setPickerOriginRect(e.currentTarget.getBoundingClientRect());
              openPicker();
            }}
          >
            <IconCalendarDot size={18} />
          </ActionIcon>
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

      <Box ref={weekBoxRef} className={CONTENT_ENTER_CLASS} style={{ overflow: "clip" }}>
        {view === "week" && week && (
          <WeekDayLabelStrip
            days={week}
            hasGroups={scheduleResources.groups !== undefined}
            resourceLabelWidth={scheduleLabelWidths.resource}
            groupLabelWidth={scheduleLabelWidths.group}
            chromeOffset={chromeHeight}
            innerRef={weekDayLabelRef}
            windowChangeRef={advanceWeekLabelRef}
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
            windowChangeRef={advanceWeekRulerRef}
          />
        )}
        {!gridLoading && view === "schedule" && scheduleResources.resources.length > 0 && (
          <TimeRulerStrip
            hasGroups={scheduleResources.groups !== undefined}
            resourceLabelWidth={scheduleLabelWidths.resource}
            groupLabelWidth={scheduleLabelWidths.group}
            chromeOffset={chromeHeight}
            innerRef={dayRulerRef}
            windowChangeRef={advanceDayRulerRef}
          />
        )}
        {/* Pinned weekday-initials strip for the Month view (replaces Mantine's
            own row, which scrolls away inside the grid's ScrollArea). Its track
            is sized to the zoomed grid so the initials stay over their columns. */}
        {!gridLoading && view === "month" && (
          <MonthWeekdayStrip
            chromeOffset={chromeHeight}
            zoom={monthZoom}
            innerRef={monthWeekdayTrackRef}
          />
        )}
        {/* Grid/skeleton swipe on a view/date change: `gridSlideRef` is
            animated via `el.animate` (Web Animations API) on the change;
            `weekBoxRef`'s overflow clip contains the transient offset. The
            pinned strips/rulers and pan controls stay outside, static. */}
        <Box ref={gridSlideRef}>
          {gridLoading ? (
            // Skeleton flavor follows the optimistic view: the shape you tapped
            // is what appears to load (same contract as loading.tsx, which
            // resolves the remembered view from the cookie).
            <>
              <LoadingStatus label="Loading calendar" />
              {shownView === "month" ? (
                <MonthGridSkeleton rows={monthGridRows(shownMonth)} />
              ) : shownIsDual ? (
                <DualPaneSkeleton
                  rows={monthGridRows(shownMonth)}
                  splitPct={dualSplit}
                  chromeOffset={chromeHeight}
                />
              ) : shownIsWeekV2 ? (
                <WeekMatrixSkeleton />
              ) : shownIsGridWeek ? (
                <WeekGridViewSkeleton chromeOffset={chromeHeight} />
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
              // While an adjacent month is loading, anchor the grid to the tapped
              // month (`shownMonth`) so it draws immediately from the held events
              // (which already cover it) instead of showing the previous month;
              // the read then swaps the full event set in place.
              date={`${monthOptimistic ? shownMonth : month}-01 00:00:00`}
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
              // Zoomed scroll-content width (see monthViewInnerStyle above): 100%
              // at zoom 1 (the whole week fits), wider when zoomed in.
              styles={{ monthViewInner: monthViewInnerStyle }}
              scrollAreaProps={monthScrollAreaProps}
              maxEventsPerDay={isDesktop ? 4 : 3}
              moreEventsProps={{
                // On the fit-to-width zoom the 7 columns drop to ~45-51px on
                // narrow phones; the library's "+ more" button has no nowrap /
                // ellipsis (unlike the event chips), so a wrapped label bleeds
                // into the week below. Pin it to a single line via the Styles
                // API root (never `style` — the library spreads its absolute
                // positioning inline and that would override it).
                styles: {
                  moreEventsButton: {
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  },
                },
              }}
              renderEvent={renderMyMonthEvent}
              onEventClick={(event, e) => {
                // Stand-ins have no real Google id yet — ignore taps on them.
                if (isOptimisticStandIn(event as CalendarEvent)) return;
                setDetailOriginRect(e.currentTarget.getBoundingClientRect());
                setDetailEvent(event as unknown as CalendarEvent);
              }}
              onDayClick={(d, e) => openDayModal(d, e.currentTarget.getBoundingClientRect())}
            />
          ) : view === "dual" ? (
            <DualPaneView
              // While an adjacent month is loading, anchor the grid to the
              // tapped month (`shownMonth`) so it draws from the held events.
              month={monthOptimistic ? shownMonth : month}
              day={shownDate}
              monthEvents={monthEvents}
              events={viewEvents}
              monthZoom={monthZoom}
              onZoomIn={() => {
                const next = stepMonthZoom(monthZoom, 1);
                setMonthZoom(next);
                announce(`Zoom ${Math.round(next * 100)}%`);
              }}
              onZoomOut={() => {
                const next = stepMonthZoom(monthZoom, -1);
                setMonthZoom(next);
                announce(`Zoom ${Math.round(next * 100)}%`);
              }}
              splitPct={dualSplit}
              onSplitCommit={handleSplitCommit}
              renderMonthEvent={renderMyMonthEvent}
              renderAgendaEvent={renderMyAgendaEvent}
              onEventClick={(event, e) => {
                if (isOptimisticStandIn(event)) return;
                setDetailOriginRect(e.currentTarget.getBoundingClientRect());
                setDetailEvent(event);
              }}
              // A day tap selects the shared anchor (the agenda pane follows)
              // instead of opening the month day modal.
              onDaySelect={pickDate}
              // Narrow only (agenda pane hidden below `lg`): the month pane is
              // the standalone Month view, whose cell tap opens the day modal.
              onDayOpen={openDayModal}
              showSwipeHint={showAgendaHint}
              chromeOffset={chromeHeight}
            />
          ) : isAgenda ? (
            <div
              ref={agendaTabSwipeRef}
              style={{ touchAction: "pan-y", overflow: "hidden" }}
              onPointerDown={resetSwipeSuppression}
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
                    if (isOptimisticStandIn(event as CalendarEvent)) return;
                    setDetailOriginRect(e.currentTarget.getBoundingClientRect());
                    setDetailEvent(event as unknown as CalendarEvent);
                  }}
                />
              </div>
              {showAgendaHint && <AgendaSwipeHint />}
            </div>
          ) : isGridWeek && week ? (
            // Week (Grid): Mantine's conventional 7-day week grid with time on
            // the vertical axis. It needs no department rows, so it renders
            // above the empty-resource guard. `withHeader={false}` drops the
            // library's own nav controls (the app's nav row drives the period)
            // but keeps its weekday/day-number row and all-day section. The grid
            // is viewport-bounded (`scrollAreaProps` below) so it scrolls
            // internally with its day header + all-day row pinned at the top —
            // unlike the other views, whose grids page-scroll with pinned strips
            // rendered outside their scrollers. Its
            // zoom is two-axis: the slot height always scales, and the day
            // columns widen past the fit level (styles below) so events grow
            // both ways and the grid pans horizontally.
            <WeekView
              date={date}
              events={viewEvents}
              startTime="00:00:00"
              endTime="23:59:59"
              intervalMinutes={60}
              slotHeight={gridWeekSlotHeightValue}
              withHeader={false}
              withCurrentTimeIndicator
              // Week containing today opens at the current time, other weeks at
              // Monday 07:00 (mount-only, re-applied after each tab switch /
              // date navigation remounts the grid via the skeleton).
              startScrollTime={
                week.includes(today) ? `${today} ${currentScrollTime}` : `${week[0]} 07:00:00`
              }
              // Stable hooks for the scrolled-only separation rule in
              // globals.css (the library flags the day header with
              // `data-scrolled` once the grid scrolls).
              classNames={{
                weekViewHeader: "c2-weekgrid-head",
                weekViewAllDaySlots: "c2-weekgrid-allday",
              }}
              // Horizontal zoom: the day-header, all-day and column rows all
              // take the same width multiplier, so they stay aligned while the
              // grid overflows into the pan. At the fit level the width is 100%
              // (the library's own layout), so nothing changes until zoomed in.
              styles={{
                // Sticky chrome ladder: regular events (3) < highlighted events
                // (4 — the app's c2-my-event / c2-ext-event classes in
                // globals.css) < hour labels (5) < all-day row (6) < day header
                // (7). Everything above 3 exists because the library's
                // timed-event root is 3 and the highlight classes are 4: the
                // all-day row must clear the in-day chips (else they paint over
                // it once the grid scrolls — it opens at the current time), and
                // the pinned hour column must clear the highlighted chips.
                weekViewHeader: { width: gridWeekColumnWidthValue, zIndex: 7 },
                // Left label column pinned while panning (the columns overflow
                // by default at the 2× fit zoom): the week-number corner, the
                // "All day" label and the hour labels each stick to the
                // scroller's left edge, opaque so the day columns scroll under.
                weekViewCorner: {
                  position: "sticky",
                  left: 0,
                  zIndex: 1,
                  backgroundColor: "var(--mantine-color-body)",
                },
                // Pin the all-day row under the day header (top: 0) so both stay
                // visible while the hour rows scroll. The header is
                // `--week-view-week-day-height` tall with a -1px bottom margin.
                weekViewAllDaySlots: {
                  width: gridWeekColumnWidthValue,
                  position: "sticky",
                  top: "calc(var(--week-view-week-day-height) - 1px)",
                  zIndex: 6,
                  backgroundColor: "var(--mantine-color-body)",
                },
                // Above the all-day event chips (the library gives those
                // z-index 2 inside the row's stacking context).
                weekViewAllDaySlotsLabel: {
                  position: "sticky",
                  left: 0,
                  zIndex: 3,
                  backgroundColor: "var(--mantine-color-body)",
                },
                weekViewSlotLabels: {
                  position: "sticky",
                  left: 0,
                  // Above the highlighted event chips (the app's c2-my-event /
                  // c2-ext-event set z-index 4 in globals.css).
                  zIndex: 5,
                },
                // The library clips the inner (overflow: hidden), which traps
                // the hour labels' sticky-left in a scrollport that never
                // scrolls; releasing it lets them pin to the scroller.
                weekViewInner: { width: gridWeekColumnWidthValue, overflow: "visible" },
              }}
              // The merged viewport serves both the slot-height zoom re-anchor
              // (layout effect above) and the drag/edge pan.
              scrollAreaProps={gridWeekScrollAreaProps}
              // External events get the purple ring (c2-ext-event), the user's
              // own get the amber one (c2-my-event) — same pass-through root as
              // the Month grid.
              renderEvent={renderMyMonthEvent}
              onEventClick={(event, e) => {
                if (isOptimisticStandIn(event as CalendarEvent)) return;
                setDetailOriginRect(e.currentTarget.getBoundingClientRect());
                setDetailEvent(event as unknown as CalendarEvent);
              }}
            />
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
              events={viewEvents}
              memberships={departmentMemberships}
              today={today}
              myRowId={currentUser}
              renderResourceLabel={renderResourceLabel}
              onEventClick={(event, e) => {
                if (isOptimisticStandIn(event)) return;
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
                if (isOptimisticStandIn(event as CalendarEvent)) return;
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
              // External events get the purple chip ring (pass-through otherwise,
              // so timed and all-day bars keep their default rendering).
              renderEvent={renderScheduleEvent}
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
                if (isOptimisticStandIn(event as CalendarEvent)) return;
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
              // External events get c2-ext-slot-event on the root either way: the
              // single root child is the chip in both shapes (the ScheduleEvent
              // inner box for timed events, the all-day Box above), so the purple
              // ring from globals.css lands on it.
              renderEvent={(event, rootProps) => {
                const payload = (event as unknown as CalendarEvent).payload;
                const extClass =
                  payload.external === true
                    ? `${rootProps.className ?? ""} c2-ext-slot-event`.trim()
                    : rootProps.className;
                const isAllDay = Boolean(payload.allDay);
                if (!isAllDay) {
                  return <UnstyledButton {...rootProps} className={extClass} />;
                }
                const stickyLeft =
                  scheduleResources.groups !== undefined
                    ? "calc(var(--resources-day-view-group-label-width) + var(--resources-day-view-resource-label-width) + 4px)"
                    : "calc(var(--resources-day-view-resource-label-width) + 4px)";
                return (
                  <UnstyledButton {...rootProps} className={extClass}>
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

      {/* Week (Grid) zoom: two independent pairs in the right-edge cluster —
          columns on top (floor at fit; pan arrows appear when it overflows),
          hour rows below. Its own remembered levels; the row pair is the
          `secondaryZoom` group. */}
      {!gridLoading && isGridWeek && week !== null && (
        <GridNavControls
          anchorRef={weekBoxRef}
          canScrollLeft={gridWeekPan.canScrollLeft}
          canScrollRight={gridWeekPan.canScrollRight}
          onPan={gridWeekPan.panTo}
          zoom={gridWeekColZoom}
          zoomMin={MIN_COLUMN_ZOOM}
          label="Columns"
          secondaryZoom={{
            value: gridWeekRowZoom,
            label: "Rows",
            onIn: () => {
              const next = stepZoom(gridWeekRowZoom, 1);
              setGridWeekRowZoom(next);
              announce(`Rows ${Math.round(next * 100)}%`);
            },
            onOut: () => {
              const next = stepZoom(gridWeekRowZoom, -1);
              setGridWeekRowZoom(next);
              announce(`Rows ${Math.round(next * 100)}%`);
            },
          }}
          onZoomIn={() => {
            const next = stepZoom(gridWeekColZoom, 1);
            setGridWeekColZoom(next);
            announce(`Columns ${Math.round(next * 100)}%`);
          }}
          onZoomOut={() => {
            const next = stepZoom(gridWeekColZoom, -1);
            setGridWeekColZoom(next);
            announce(`Columns ${Math.round(next * 100)}%`);
          }}
        />
      )}

      {/* Month-grid navigation: the same right-edge cluster (zoom in/out over
          the right pan arrow) plus the left pan arrow, driven by the month
          grid's own pan state (monthPan). The zoom pair always shows; the pan
          arrows appear only once a zoom level makes the grid overflow the
          viewport. Zooming out stops at 100% — the fit-to-width floor. */}
      {!gridLoading && view === "month" && (
        <GridNavControls
          anchorRef={weekBoxRef}
          canScrollLeft={monthPan.canScrollLeft}
          canScrollRight={monthPan.canScrollRight}
          onPan={monthPan.panTo}
          zoom={monthZoom}
          zoomMin={MIN_MONTH_ZOOM}
          zoomMax={MAX_MONTH_ZOOM}
          onZoomIn={() => {
            const next = stepMonthZoom(monthZoom, 1);
            setMonthZoom(next);
            announce(`Zoom ${Math.round(next * 100)}%`);
          }}
          onZoomOut={() => {
            const next = stepMonthZoom(monthZoom, -1);
            setMonthZoom(next);
            announce(`Zoom ${Math.round(next * 100)}%`);
          }}
        />
      )}

      {/* Floating fullscreen (immersive) toggle — anchored to the top-right of
          the calendar, beside the zoom/pan cluster. Always present (it is the
          in-page exit path in immersive mode), so it is not gated on grid
          content like GridNavControls. */}
      <FullscreenToggle
        anchorRef={weekBoxRef}
        chromeRef={tabsListRef}
        active={immersiveMode.active}
        onToggle={immersiveMode.active ? immersiveMode.exit : immersiveMode.enter}
      />

      <Modal
        opened={agendaDate !== null}
        onClose={() => setAgendaDate(null)}
        title={
          agendaViewDate ? (
            <Group gap="xs" justify="center" w="100%">
              <Text fw={600} size="sm" style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                {dayjs(agendaViewDate).format("dddd, MMMM D, YYYY")}
              </Text>
              <ActionIcon
                variant="subtle"
                size="sm"
                aria-label="Previous day"
                onClick={() => shiftAgendaDay(-1)}
              >
                <IconChevronLeft size={16} />
              </ActionIcon>
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
        size={isNarrow ? "xs" : isDesktop ? "md" : "sm"}
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
              onPointerDown={resetSwipeSuppression}
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
                    if (isOptimisticStandIn(event as CalendarEvent)) return;
                    setDetailOriginRect(e.currentTarget.getBoundingClientRect());
                    setDetailEvent(event as unknown as CalendarEvent);
                  }}
                />
              </div>
            </div>
            {showAgendaHint && <AgendaSwipeHint />}
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
          window.dispatchEvent(new CustomEvent(PINNED_EVENTS_CHANGED_EVENT));
          notifyEventsChanged();
          refreshAfterSave();
        }}
        onOptimistic={applyOptimistic}
        onOptimisticSettled={settleOptimistic}
        onOptimisticRollback={rollbackOptimistic}
        peopleNames={peopleNames}
        calendarNames={calendarNames}
        originRect={detailOriginRect}
        currentUserId={currentUser}
        isAdmin={isAdmin}
        myActiveDepartmentIds={myActiveDepartmentIds}
      />

      <Modal.Root
        opened={formIsOpen && !formMinimized}
        onClose={minimizeForm}
        keepMounted
        centered
        // A fixed vertical gutter keeps the centered wizard's top/bottom gaps
        // equal (Mantine centers inside a `100dvh - 2*gutter` box) and leaves
        // room for the "Tap outside to minimize" caption at the bottom. The
        // wizard body fills the box (WIZARD_BODY_HEIGHT_MOBILE), so the gaps
        // stay equal instead of collapsing to the bottom edge.
        yOffset="44px"
        size={isNarrow ? "xs" : isDesktopWide ? "lg" : isDesktop ? "md" : "sm"}
        zIndex={250}
        transitionProps={formTransitionProps}
      >
        <Modal.Overlay />
        <Modal.Content>
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
                eventTypeGroups={eventTypeGroups}
                eventTitleRecipe={eventTitleRecipe}
                viewEventTitleRecipe={viewEventTitleRecipe}
                viewLabel={activeView.name}
                currentUser={currentUser}
                isAdmin={isAdmin}
                inviteeDepartments={inviteeDepartments}
                inviteeUsers={inviteeUsers}
                onOptimistic={applyOptimistic}
                onOptimisticSettled={settleOptimistic}
                onOptimisticRollback={rollbackOptimistic}
                onViewSaved={openSavedEventDetail}
                optimisticHome={optimisticHome}
                onDone={() => {
                  closeForm();
                  window.dispatchEvent(new CustomEvent(PINNED_EVENTS_CHANGED_EVENT));
                  notifyEventsChanged();
                  refreshAfterSave();
                }}
              />
            )}
          </Modal.Body>
        </Modal.Content>
      </Modal.Root>

      {/* "Tap outside to minimize" hint, anchored to the viewport bottom (not
          the dialog's) so its position is stable regardless of dialog size.
          It lives outside the Paper deliberately — the Paper clips anything
          inside it (overflow-y) — and portals to <body> (like the restore
          bubble's Affix) so its z-index competes at the root level: 260 puts
          it above the modal's 250 overlay and below the 300 bubble,
          cross-fading with the modal's own 250ms transitions.
          pointer-events: none, so tapping the caption lands on the overlay
          → minimizes, which is what it advertises. */}
      <Portal>
        <Text
          size="xs"
          aria-hidden={!hintVisible}
          style={{
            position: "fixed",
            bottom: 16,
            left: 0,
            right: 0,
            textAlign: "center",
            margin: 0,
            zIndex: 260,
            color: "rgba(255, 255, 255, 0.85)",
            opacity: hintVisible ? 1 : 0,
            transition: `opacity ${MOTION.fade}ms ease`,
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
        kind={view === "month" ? "month" : isWeek ? "week" : "day"}
        date={view === "month" ? month : isAgenda ? headerDate : isDual ? shownDate : date}
        onPick={view === "month" ? pickMonth : isAgenda ? applyAgendaDay : pickDate}
        onToday={goToday}
        onClose={closePicker}
        originRect={pickerOriginRect}
      />

      <FilterModal
        opened={filterOpened}
        onClose={closeFilter}
        title="Filters"
        groups={filterGroups}
        values={filterValues}
        onApply={handleApplyFilters}
        collapsedGroupLabels={["Event Types"]}
        hint={`These filters apply to ${activeView.name} only.`}
        originRect={filterOriginRect}
      />

      {/* Manage-views dialog: house-style management modal (src/components
          conventions — see EventTypeGroupsModal). ↑/↓ reorder, a per-row Edit
          dialog (name + type + an Edit-filters button that switches to the view
          and opens its filter dialog) and delete behind a nested confirm; its
          Add-view button reuses the quick dialog above. Only shown when the
          account owns stored views (canManageViews). */}
      {canManageViews && (
        <EditViewsModal
          opened={editOpened}
          onClose={closeEdit}
          tabs={tabs}
          activeView={activeView}
          onMutated={refreshAfterViewsSave}
          onNavigateToView={switchTab}
          onEditFilters={handleEditFilters}
          onAddView={openAddView}
        />
      )}

      {/* Quick "Add view" dialog: opened by the strip's + and by the
          Manage-views modal's Add-view button (kind picker + name). Only shown
          when the account owns stored views (canManageViews). */}
      {canManageViews && (
        <Modal
          opened={createOpened}
          onClose={closeCreateView}
          title="Add view"
          centered
          transitionProps={{ transition: "pop", duration: MOTION.popover, timingFunction: "ease" }}
        >
          <Stack>
            <div>
              <Text fw={600} size="sm" mb={6}>
                View type
              </Text>
              <ViewTypePicker value={createKind} onSelect={pickCreateKind} />
            </div>
            <TextInput
              label="Name"
              value={createName}
              maxLength={40}
              error={createError ?? undefined}
              onChange={(event) => {
                setCreateName(event.currentTarget.value);
                setCreateError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void submitCreateView();
                }
              }}
              autoFocus
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={closeCreateView}>
                Cancel
              </Button>
              <Button
                onClick={() => void submitCreateView()}
                loading={creating}
                loaderProps={BUTTON_LOADER_PROPS}
                disabled={createName.trim().length === 0}
              >
                Add view
              </Button>
            </Group>
          </Stack>
        </Modal>
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
              openCreate(
                isAgenda ? headerDate : isDual ? shownDate : today,
                e.currentTarget.getBoundingClientRect(),
              )
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
