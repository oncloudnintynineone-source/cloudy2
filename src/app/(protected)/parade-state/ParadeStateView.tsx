"use client";

import dayjs from "dayjs";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Menu,
  Modal,
  Paper,
  Stack,
  Text,
  useComputedColorScheme,
} from "@mantine/core";
import { useClipboard, useDisclosure, useDrag, useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconCalendarDot,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClipboard,
  IconClipboardCheck,
  IconDotsVertical,
  IconMapPin,
  IconRefresh,
  IconSitemap,
  IconUser,
  IconX,
} from "@tabler/icons-react";

import { AgendaSwipeHint } from "@/components/AgendaSwipeHint";
import { EmptyState } from "@/components/EmptyState";
import { FilterButton } from "@/components/FilterButton";
import { PageHeader } from "@/components/PageHeader";
import { useReportActivity } from "@/components/ActivityBar";
import { useColdStartContent } from "@/components/ColdStartReady";
import { FilterModal, type FilterGroup } from "@/components/FilterModal";
import { FAB_ICON_SIZE, FloatingActionButton, FloatingToolbar } from "@/components/FloatingToolbar";
import { LoadingStatus } from "@/components/LoadingStatus";
import type { WeekStart } from "@/lib/events/datetime";
import type { CalendarEvent } from "@/lib/events/queries";
import { CONTENT_ENTER_CLASS, useContentEnter } from "@/lib/loading/contentEnter";
import { useMinSkeletonHold } from "@/lib/loading/minHoldLoading";
import { type Rect } from "@/lib/motion/origin";
import { MOTION } from "@/lib/motion/timing";
import { departmentPathLabels, departmentTreeRows } from "@/lib/roster/hierarchy";
import { buildEventsByUser, eventCoversDay, toParadeEvent } from "@/lib/parade/dayEvents";
import { buildParadeSections, type ParadeSection } from "@/lib/parade/sections";
import { formatFullName } from "@/lib/settings/formatName";
import { activatable } from "@/lib/ui/activatable";
import {
  getAgendaSwipeHintServerSnapshot,
  getAgendaSwipeHintSnapshot,
  markAgendaSwipeHintSeen,
  subscribeAgendaSwipeHint,
} from "@/lib/ui/agendaSwipeHint";
import { COARSE_POINTER_MEDIA_QUERY } from "@/lib/theme";
import { saveParadeFilters } from "@/lib/userPrefs/actions";
import { invalidateCurrentPathCaches } from "@/lib/pwa/client";

import { buildAttendanceReport, type AttendanceReportDepartment } from "./attendanceReport";
import {
  clearAttendance,
  getAttendanceServerSnapshot,
  getAttendanceSnapshot,
  saveAttendanceIds,
  subscribeAttendance,
} from "./attendanceStorage";
import { departmentSummaryRows, departmentTreeHeadcount } from "./headcount";
import { formatEventTimeBadge } from "@/lib/parade/eventTimeBadge";
import { ParadeStateDepartmentSkeleton } from "./paradeStateSkeleton";

// Opened on demand; splitting it keeps `@mantine/dates` + `@mantine/schedule`'s
// `MobileMonthView` out of the parade page's initial chunk.
const DateSelectorModal = dynamic(
  () => import("@/components/DateSelectorModal").then((mod) => mod.DateSelectorModal),
  { ssr: false },
);

/** Horizontal drag distance (px) before a swipe flips the day (same as the
 *  dashboard's agenda swipe). */
const DAY_SWIPE_THRESHOLD = 48;

interface ParadeStateUser {
  id: string;
  name: string;
  shortname: string | null;
  department: { id: string; name: string; sortOrder?: number } | null;
}

/** The section shape lives in the shared pure helpers. */
type DepartmentSection = ParadeSection<ParadeStateUser>;

function sectionHasUsers(section: DepartmentSection): boolean {
  if (section.users.length > 0) return true;
  return section.children.some(sectionHasUsers);
}

function countCheckedIn(section: DepartmentSection, checkedIds: ReadonlySet<string>): number {
  let count = section.users.filter((user) => checkedIds.has(user.id)).length;
  for (const child of section.children) {
    count += countCheckedIn(child, checkedIds);
  }
  return count;
}

export interface ParadeStateViewProps {
  date: string;
  month: string;
  users: ParadeStateUser[];
  events: CalendarEvent[];
  calendars: { id: string; name: string; sortOrder?: number; parentId: string | null }[];
  currentUser: string;
  selectedCalendarIds: string[];
  selectedUserIds: string[];
  filterUsers: {
    id: string;
    name: string;
    displayName: string;
    departmentName: string | null;
    departmentSort: number | null;
    departmentId: string | null;
    departmentParentId: string | null;
  }[];
  nameTemplate: string;
  /** Admin: the empty state links into Settings; non-admins get the plain message. */
  isAdmin?: boolean;
  /** Which day the account's calendar week starts on (for the date picker). */
  weekStartsOn?: WeekStart;
}

export function ParadeStateView({
  date: initialDate,
  month: initialMonth,
  users,
  events,
  calendars,
  currentUser,
  selectedCalendarIds: initSelectedCalendars,
  selectedUserIds: initSelectedUsers,
  filterUsers,
  nameTemplate,
  isAdmin = false,
  weekStartsOn = "monday",
}: ParadeStateViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [date, setDate] = useState(initialDate);
  const [month, setMonth] = useState(initialMonth);
  const [selectedCalendars, setSelectedCalendars] = useState(initSelectedCalendars);
  const [selectedUsers, setSelectedUsers] = useState(initSelectedUsers);
  const [filterOpened, { open: openFilter, close: closeFilter }] = useDisclosure(false);
  // Where the filter trigger sat on screen; the dialog grows out of / shrinks
  // back into it (see src/lib/motion/origin.ts).
  const [filterOriginRect, setFilterOriginRect] = useState<Rect | null>(null);
  const [pickerOpened, { open: openPicker, close: closePicker }] = useDisclosure(false);
  // Where the date-picker trigger sat on screen; the dialog grows out of /
  // shrinks back into it (same convention as the dashboard nav row).
  const [pickerOriginRect, setPickerOriginRect] = useState<Rect | null>(null);
  // Reset wipes attendance for every date, so it confirms first like every
  // other destructive action in the app.
  const [resetOpened, { open: openResetConfirm, close: closeResetConfirm }] = useDisclosure(false);
  // Direction of the in-month day slide (1 = forward/next, -1 = back/prev);
  // 0 disables it so month-edge switches and jumps use the reveal fade only.
  const [slideDir, setSlideDir] = useState(0);

  // Cross-month day switches need the new month's events from the server (the
  // local `date` state flips optimistically, so the stale event props would
  // briefly render an empty list); show a skeleton — with a minimum ~350ms
  // hold — until the new month commits, then fade the content in. In-month
  // switches and filter applies stay instant: their data is already derived
  // correctly from local state, so a skeleton there would only hurt the snappy
  // feel.
  const contentLoading = useMinSkeletonHold(initialMonth !== month);
  // The global activity bar mirrors the cross-month skeleton gate.
  useReportActivity(initialMonth !== month, "parade:nav");
  const contentRef = useRef<HTMLDivElement | null>(null);
  useContentEnter(contentRef, !contentLoading);
  // Cold-start readiness: this view only mounts after the route's events have
  // streamed, so reporting on mount is exactly "content painted".
  useColdStartContent();

  // Attendance mode: checked users are kept per shown date in localStorage
  // (never the database), read live through the attendance external store so
  // day switches swap rosters without any reload and the mode itself survives
  // a reload (it rides the `?attendance=1` URL param).
  const [attendanceMode, setAttendanceMode] = useState(
    () => searchParams.get("attendance") === "1",
  );
  const attendance = useSyncExternalStore(
    subscribeAttendance,
    getAttendanceSnapshot,
    getAttendanceServerSnapshot,
  );
  const clipboard = useClipboard();

  const checkedIds = useMemo(() => new Set(attendance[date] ?? []), [attendance, date]);
  const presentTotal = useMemo(
    () => users.filter((user) => checkedIds.has(user.id)).length,
    [users, checkedIds],
  );

  const colorScheme = useComputedColorScheme("light");
  const today = dayjs().format("YYYY-MM-DD");

  // Day swipe (touch or mouse drag), mirroring the dashboard agenda gesture:
  // the roster slides in from the direction of travel. The caption is
  // touch-only and shown at most once per session (shared with the dashboard).
  const isCoarsePointer = useMediaQuery(COARSE_POINTER_MEDIA_QUERY);
  const swipeHintSeen = useSyncExternalStore(
    subscribeAgendaSwipeHint,
    getAgendaSwipeHintSnapshot,
    getAgendaSwipeHintServerSnapshot,
  );
  const showSwipeHint = isCoarsePointer && !swipeHintSeen;
  const swipedRef = useRef(false);
  // One-shot click suppression: a swipe arms `swipedRef` and the content
  // wrapper's `onClickCapture` swallows the synthesized click a drag emits
  // (attendance cards toggle on click, so this keeps a swipe from checking
  // someone in). Clearing it on every new pointer-down re-arms suppression for
  // the drag's own click without ever swallowing a later tap.
  const resetSwipeSuppression = useCallback(() => {
    swipedRef.current = false;
  }, []);
  const { ref: swipeRef } = useDrag<HTMLDivElement>(
    (state) => {
      if (!state.last || state.canceled || state.tap) return;
      if (Math.abs(state.movement[0]) < DAY_SWIPE_THRESHOLD) return;
      swipedRef.current = true;
      markAgendaSwipeHintSeen();
      shiftDay(state.movement[0] < 0 ? 1 : -1);
    },
    { axis: "lock", axisThreshold: 8, threshold: 10, filterTaps: true },
  );

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

  function shiftDay(delta: number) {
    const next = dayjs(date).add(delta, "day");
    const nextDate = next.format("YYYY-MM-DD");
    const nextMonth = next.format("YYYY-MM");
    setDate(nextDate);
    if (nextMonth !== month) {
      // Month edges refetch from the server; the skeleton + reveal fade
      // replace the directional slide, so clear it.
      setSlideDir(0);
      setMonth(nextMonth);
      navigate({ date: nextDate, month: nextMonth });
    } else {
      setSlideDir(delta > 0 ? 1 : -1);
      navigate({ date: nextDate });
    }
  }

  function goToday() {
    const todayMonth = dayjs().format("YYYY-MM");
    setDate(today);
    setSlideDir(0);
    if (todayMonth !== month) {
      setMonth(todayMonth);
      navigate({ date: today, month: todayMonth });
    } else {
      navigate({ date: today });
    }
  }

  function pickDate(picked: string) {
    if (picked === date) return;
    const nextMonth = picked.slice(0, 7);
    setDate(picked);
    setSlideDir(0);
    if (nextMonth !== month) {
      setMonth(nextMonth);
      navigate({ date: picked, month: nextMonth });
    } else {
      navigate({ date: picked });
    }
  }

  // Strip the legacy `types` param (the Event Types filter used to write it)
  // so stale history entries and deep links don't carry it around.
  const typesParamClearedRef = useRef(false);
  useEffect(() => {
    if (searchParams.get("types") === null || typesParamClearedRef.current) {
      return;
    }
    typesParamClearedRef.current = true;
    navigate({ types: null });
  }, [searchParams, navigate]);

  function handleApplyFilters(values: Record<string, string[]>) {
    const calIds = values["Calendars"] ?? [];
    const userIds = values["Users"] ?? [];
    setSelectedCalendars(calIds);
    setSelectedUsers(userIds);
    void persistFilters(calIds, userIds);
  }

  /**
   * Persist the Parade filters server-side (per account), then re-render from
   * the server so the department rows + events refetch under the new filter
   * set. Empty lists mean "all calendars / no user filter" — the day is never
   * remembered, so a bare /parade-state always opens on today.
   */
  function persistFilters(calIds: string[], userIds: string[]) {
    void saveParadeFilters({ cal: calIds, users: userIds }).then((result) => {
      if (!result.ok) {
        notifications.show({ color: "red", message: result.error });
        return;
      }
      void invalidateCurrentPathCaches().then(() => startTransition(() => router.refresh()));
    });
  }

  const filterGroups: FilterGroup[] = useMemo(() => {
    // Department picker rows: the calendars prop is already in display
    // (preorder) order; re-tree it and label each option with its full
    // ancestor chain ("HQ › Logistics"), so the hierarchy reads in the chip.
    const calendarRows = departmentTreeRows(
      calendars.map((calendar) => ({
        id: calendar.id,
        name: calendar.name,
        sortOrder: calendar.sortOrder ?? 0,
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
        variant: "search",
        action: filterUsers.some((user) => user.id === currentUser)
          ? {
              label: "Myself",
              icon: <IconUser size={14} />,
              isApplied: (selected) => selected.length === 1 && selected[0] === currentUser,
              apply: (setValues, { selected }) => {
                const isActive = selected.length === 1 && selected[0] === currentUser;
                setValues(isActive ? [] : [currentUser]);
              },
            }
          : undefined,
      });
    }
    return groups;
  }, [calendars, filterUsers, currentUser]);

  const filterValues: Record<string, string[]> = useMemo(
    () => ({
      Calendars: selectedCalendars,
      Users: selectedUsers,
    }),
    [selectedCalendars, selectedUsers],
  );

  const activeFilterCount =
    (selectedCalendars.length > 0 && selectedCalendars.length < calendars.length ? 1 : 0) +
    (selectedUsers.length > 0 ? 1 : 0);

  const dayEvents = useMemo(
    () => events.filter((event) => eventCoversDay(event, date)).map(toParadeEvent),
    [events, date],
  );

  const eventsByUser = useMemo(() => buildEventsByUser(dayEvents), [dayEvents]);

  // The department hierarchy (parents before children, by the shared sortOrder)
  // with each user's direct department section; "Unassigned" stays a terminal
  // top-level section. Headcounts aggregate down the tree at render time.
  const sections: DepartmentSection[] = useMemo(
    () => buildParadeSections(users, calendars),
    [users, calendars],
  );

  // The read-only headcount summary shown above the roster: one row per
  // section in tree order (skipping empty subtrees, so it mirrors the body),
  // where present is the checked-in count in attendance mode and the in-camp
  // count otherwise — exactly like the section headers below.
  const summary = useMemo(() => {
    const isPresent = (userId: string) =>
      attendanceMode ? checkedIds.has(userId) : (eventsByUser.get(userId)?.length ?? 0) === 0;
    return departmentSummaryRows(sections, isPresent);
  }, [sections, eventsByUser, attendanceMode, checkedIds]);

  function enterAttendance() {
    setAttendanceMode(true);
    navigate({ attendance: "1" });
  }

  function exitAttendance() {
    setAttendanceMode(false);
    navigate({ attendance: null });
  }

  function toggleAttendance(userId: string) {
    const current = new Set(attendance[date] ?? []);
    if (current.has(userId)) {
      current.delete(userId);
    } else {
      current.add(userId);
    }
    saveAttendanceIds(date, [...current]);
  }

  // Clearing wipes only the shown day (the working unit); the destructive
  // all-dates wipe lives behind its own confirm.
  function resetDay() {
    saveAttendanceIds(date, []);
  }

  // Reset clears every date's checks, not just the shown day's.
  function resetAttendance() {
    clearAttendance();
  }

  async function copyAttendanceReport() {
    // Full names (raw roster names, not the display-name template); a checked
    // user renders bare (present) regardless of their calendar. The tree
    // shape carries the hierarchy: flat blocks in tree order, parent counts
    // include every sub-department.
    const toReport = (section: DepartmentSection): AttendanceReportDepartment => ({
      name: section.name,
      users: section.users.map((user) => ({ id: user.id, name: user.name })),
      ...(section.children.length > 0 ? { children: section.children.map(toReport) } : {}),
    });
    const text = buildAttendanceReport(sections.map(toReport), checkedIds);
    try {
      await clipboard.copy(text);
      notifications.show({ color: "green", message: "Parade state copied to clipboard" });
    } catch {
      notifications.show({ color: "red", message: "Could not copy to clipboard" });
    }
  }

  // Desktop: the attendance entry point lives beside the kebab menu instead of
  // the bottom corner FAB — same convention as the dashboard's nav-row
  // "New event" button. It is a true toggle: entering turns it into the
  // "Done" exit button, while Reset/Copy live in the mode bar.
  const desktopAttendanceButton = (
    <Button
      visibleFrom="lg"
      __vars={{ "--button-height": "36px" }}
      variant={attendanceMode ? "light" : undefined}
      color={attendanceMode ? "teal" : undefined}
      leftSection={attendanceMode ? <IconCheck size={16} /> : <IconClipboardCheck size={16} />}
      onClick={attendanceMode ? exitAttendance : enterAttendance}
    >
      {attendanceMode ? "Done" : "Attendance"}
    </Button>
  );

  function renderUserCard(user: ParadeStateUser) {
    const userEvents = eventsByUser.get(user.id) ?? [];
    const checked = attendanceMode && checkedIds.has(user.id);
    const displayName = formatFullName(
      { name: user.name, departmentName: user.department?.name ?? null },
      nameTemplate,
    );
    return (
      <Paper
        key={user.id}
        withBorder
        p="sm"
        onClick={attendanceMode ? () => toggleAttendance(user.id) : undefined}
        {...(attendanceMode ? activatable(() => toggleAttendance(user.id)) : {})}
        aria-pressed={attendanceMode ? checked : undefined}
        style={{
          cursor: attendanceMode ? "pointer" : undefined,
          ...(checked
            ? {
                backgroundColor: colorScheme === "dark" ? "#10281b" : "#e8f5e9",
                borderColor: "var(--mantine-color-green-4)",
              }
            : userEvents.length > 0
              ? {
                  backgroundColor: colorScheme === "dark" ? "#3d3200" : "#fff8e1",
                  borderColor: "var(--mantine-color-yellow-4)",
                }
              : {}),
        }}
      >
        <Stack gap={2}>
          <Group gap="xs" wrap="nowrap" align="center">
            {attendanceMode && (
              // Status glyph only — the card itself is the toggle, so this
              // must not be an interactive child (a nested control would split
              // focus and double-fire through activatable).
              <Box
                aria-hidden
                style={{
                  flexShrink: 0,
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: checked ? "none" : "1.5px solid var(--mantine-color-gray-5)",
                  background: checked ? "var(--mantine-color-teal-6)" : "transparent",
                }}
              >
                {checked && <IconCheck size={13} stroke={3} color="white" />}
              </Box>
            )}
            {/* Icon twin of the amber card background (the
                legend names it), so out-of-camp status never
                rides on color alone. */}
            {!checked && userEvents.length > 0 && (
              <IconMapPin
                size={14}
                color="var(--mantine-color-dimmed)"
                aria-hidden
                style={{ flexShrink: 0 }}
              />
            )}
            <Text fw={600} size="sm">
              {displayName}
            </Text>
          </Group>
          {userEvents.length > 0 && (
            <Stack gap={2} ml="xs">
              {userEvents.map((event) => (
                <Group key={event.id} gap={6} wrap="nowrap" align="center">
                  <Badge
                    size="xs"
                    variant="light"
                    color="gray"
                    radius="sm"
                    style={{ flexShrink: 0 }}
                  >
                    {formatEventTimeBadge(event, date)}
                  </Badge>
                  <Text size="xs" fw={400} c="dimmed" style={{ flex: 1, minWidth: 0 }}>
                    {event.title}
                  </Text>
                </Group>
              ))}
            </Stack>
          )}
        </Stack>
      </Paper>
    );
  }

  // One level of the hierarchy: header (headcount aggregated over every
  // sub-department below), the direct members' card grid, then the nested
  // sub-departments. Each level indents within its parent, so depth
  // accumulates naturally.
  function renderSection(section: DepartmentSection, depth: number) {
    if (!sectionHasUsers(section)) return null;
    const headcount = departmentTreeHeadcount(section, eventsByUser);
    const presentCount = attendanceMode ? countCheckedIn(section, checkedIds) : headcount.present;
    return (
      <Box key={section.id ?? "__unassigned__"} style={{ marginLeft: depth * 16 }}>
        <Text fw={700} size="sm" c="dimmed" mb="xs" tt="uppercase" lh={1}>
          {section.name} — {presentCount}/{headcount.total} {attendanceMode ? "present" : "in camp"}
        </Text>
        {section.users.length > 0 && (
          // Single column on mobile; auto-filling card grid at lg
          // (see .card-grid in globals.css).
          <Box component="div" className="card-grid">
            {section.users.map(renderUserCard)}
          </Box>
        )}
        {section.children.map((child) => renderSection(child, depth + 1))}
      </Box>
    );
  }

  const dayLabel = dayjs(date).format("ddd, MMM D, YYYY");

  return (
    // fab-page-pad replaces pb="xl": reserves clearance for the mobile
    // attendance FAB below the last card row, restores plain xl at lg.
    <Stack gap="md" className="fab-page-pad">
      <PageHeader title="Parade State" subtitle="Roster whereabouts and attendance, by day." />
      {/* Same nav-row recipe as the calendar page: the day label takes the
          free space, prev/next sit together beside it, then the mode/filter/
          date controls. Today lives in the date-picker dialog. */}
      <Group align="center" gap="xs" wrap="nowrap">
        <Text fw={600} size="md" lineClamp={1} style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
          {dayLabel}
        </Text>
        <ActionIcon
          size={36}
          variant="default"
          aria-label="Previous day"
          onClick={() => shiftDay(-1)}
        >
          <IconChevronLeft size={18} />
        </ActionIcon>
        <ActionIcon size={36} variant="default" aria-label="Next day" onClick={() => shiftDay(1)}>
          <IconChevronRight size={18} />
        </ActionIcon>
        {desktopAttendanceButton}
        <FilterButton
          activeCount={activeFilterCount}
          size={36}
          iconSize={18}
          onClick={(e) => {
            setFilterOriginRect(e.currentTarget.getBoundingClientRect());
            openFilter();
          }}
        />
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

      {/* Attendance mode bar: a visible, bounded mode with its own exit (the
          entry button toggles to Done), the live present count, Copy, and a
          Reset overflow. The destructive all-dates wipe stays behind its own
          confirm. */}
      {attendanceMode && (
        <Paper
          withBorder
          p="xs"
          style={{
            borderColor: "var(--mantine-color-teal-4)",
            backgroundColor: colorScheme === "dark" ? "#0b2b21" : "#e6fcf5",
          }}
        >
          <Group justify="space-between" gap="xs" wrap="wrap">
            <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
              <IconClipboardCheck size={18} color="var(--mantine-color-teal-6)" aria-hidden />
              <Stack gap={0} style={{ minWidth: 0 }}>
                <Text fw={600} size="sm" lineClamp={1}>
                  Attendance mode
                </Text>
                <Text size="xs" c="dimmed" lineClamp={1}>
                  Saved on this device only
                </Text>
              </Stack>
            </Group>
            <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
              <Text size="sm" fw={700} style={{ flexShrink: 0 }}>
                {presentTotal}/{users.length} present
              </Text>
              <Button
                size="compact-sm"
                variant="light"
                color="teal"
                leftSection={<IconClipboard size={14} />}
                onClick={() => void copyAttendanceReport()}
              >
                Copy
              </Button>
              <Menu
                shadow="md"
                width={220}
                position="bottom-end"
                transitionProps={{
                  transition: "pop-top-right",
                  duration: MOTION.popover,
                  timingFunction: "ease",
                }}
              >
                <Menu.Target>
                  <ActionIcon size={32} variant="subtle" aria-label="Attendance options">
                    <IconDotsVertical size={16} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Attendance</Menu.Label>
                  <Menu.Item leftSection={<IconX size={16} />} onClick={resetDay} closeMenuOnClick>
                    Clear this day
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<IconRefresh size={16} />}
                    onClick={openResetConfirm}
                    closeMenuOnClick
                  >
                    Clear all dates…
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          </Group>
        </Paper>
      )}

      {/* Status legend: the card colors carry real meaning, so they are named
          in text (color-blind safe). The live present count lives in the
          mode bar above. */}
      <Group gap="md" wrap="nowrap">
        <Group gap={6} wrap="nowrap">
          <Box
            aria-hidden
            w={10}
            h={10}
            style={{ background: "var(--mantine-color-yellow-4)", borderRadius: 2 }}
          />
          <Text size="xs" c="dimmed">
            Out of camp
          </Text>
        </Group>
        {attendanceMode && (
          <Group gap={6} wrap="nowrap">
            <Box
              aria-hidden
              w={10}
              h={10}
              style={{ background: "var(--mantine-color-green-4)", borderRadius: 2 }}
            />
            <Text size="xs" c="dimmed">
              Marked present
            </Text>
          </Group>
        )}
      </Group>

      {/* Day swipe container: horizontal drag flips the day (the roster slides
          in from the direction of travel); vertical scroll is left to the
          browser via touch-action. `overflow: hidden` clips the transient
          slide offset. The click suppressor swallows the click a drag emits so
          attendance taps never fire off a swipe. */}
      <Box
        ref={swipeRef}
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
        {/* contentRef/`content-enter` stay on the unkeyed parent so the
            skeleton → content fade is not re-triggered by the remount. */}
        <Box ref={contentRef} className={CONTENT_ENTER_CLASS}>
          {/* The day key restarts the directional slide-in on every day change;
              month edges get the reveal fade instead (slide dir is cleared). */}
          <Box
            key={date}
            className={
              slideDir === 1
                ? "agenda-slide-next"
                : slideDir === -1
                  ? "agenda-slide-prev"
                  : undefined
            }
          >
            {contentLoading ? (
              <Stack gap="lg">
                <LoadingStatus label="Loading parade state" />
                <ParadeStateDepartmentSkeleton users={2} />
                <ParadeStateDepartmentSkeleton users={3} />
              </Stack>
            ) : !sections.some(sectionHasUsers) ? (
              isAdmin ? (
                <EmptyState
                  icon={users.length === 0 ? <IconSitemap size={18} /> : <IconUser size={18} />}
                  description={users.length === 0 ? "No departments found." : "No users found."}
                  actionLabel={users.length === 0 ? "Manage departments" : "Manage users"}
                  actionHref={users.length === 0 ? "/settings/departments" : "/settings/users"}
                />
              ) : (
                <EmptyState
                  icon={users.length === 0 ? <IconSitemap size={18} /> : <IconUser size={18} />}
                  description={users.length === 0 ? "No departments found." : "No users found."}
                />
              )
            ) : (
              <Stack gap="lg">
                {/* Roll-call summary: a Total plus one line per section in tree
                order (sub-departments indented under their parent, with the
                count of every section covering its whole subtree). Read-only
                — the roster below is where people are listed. */}
                {summary.rows.length > 0 && (
                  <Paper withBorder p="sm">
                    <Stack gap={6}>
                      <Group justify="space-between" align="baseline" gap="xs" wrap="nowrap">
                        <Text fw={700} size="sm">
                          Total
                        </Text>
                        <Text fw={700} size="sm">
                          ({summary.total.present}/{summary.total.total}{" "}
                          {attendanceMode ? "present" : "in camp"})
                        </Text>
                      </Group>
                      <Divider />
                      <Stack gap={2}>
                        {summary.rows.map((row, index) => (
                          <Text
                            key={`${row.depth}:${row.name}:${index}`}
                            size="sm"
                            fw={row.depth === 0 ? 600 : 400}
                            lh={1.5}
                            pl={row.depth * 28}
                          >
                            {row.depth > 0 && (
                              <Text component="span" c="dimmed" inherit>
                                ›{" "}
                              </Text>
                            )}
                            {row.name}{" "}
                            <Text component="span" c="dimmed" inherit>
                              ({row.present}/{row.total})
                            </Text>
                          </Text>
                        ))}
                      </Stack>
                    </Stack>
                  </Paper>
                )}
                {sections.map((section) => renderSection(section, 0))}
              </Stack>
            )}
          </Box>
        </Box>
        {showSwipeHint && <AgendaSwipeHint />}
      </Box>

      {/* The attendance FAB is mobile-only; at lg the entry point is the
          nav-row button beside the filter/date buttons. hiddenFrom sits on the
          toolbar itself: its Affix portals to <body>, so a wrapper element
          could not hide it. */}
      <FloatingToolbar hiddenFrom="lg">
        <FloatingActionButton
          aria-label={attendanceMode ? "Exit attendance mode" : "Start attendance"}
          className={attendanceMode ? "c2-glass-fab--teal" : "c2-glass-fab--brand"}
          variant={attendanceMode ? "light" : undefined}
          color={attendanceMode ? "teal" : undefined}
          onClick={attendanceMode ? exitAttendance : enterAttendance}
        >
          {attendanceMode ? (
            <IconCheck size={FAB_ICON_SIZE} />
          ) : (
            <IconClipboardCheck size={FAB_ICON_SIZE} />
          )}
        </FloatingActionButton>
      </FloatingToolbar>

      <FilterModal
        opened={filterOpened}
        onClose={closeFilter}
        title="Filters"
        groups={filterGroups}
        values={filterValues}
        onApply={handleApplyFilters}
        originRect={filterOriginRect}
      />
      <DateSelectorModal
        opened={pickerOpened}
        kind="day"
        date={date}
        onPick={pickDate}
        onToday={goToday}
        onClose={closePicker}
        originRect={pickerOriginRect}
        weekStartsOn={weekStartsOn}
      />
      <Modal opened={resetOpened} onClose={closeResetConfirm} title="Clear all dates" centered>
        <Text>Clear attendance checks for every date? This cannot be undone.</Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={closeResetConfirm}>
            Cancel
          </Button>
          <Button
            color="red"
            onClick={() => {
              resetAttendance();
              closeResetConfirm();
            }}
          >
            Clear all
          </Button>
        </Group>
      </Modal>
    </Stack>
  );
}
