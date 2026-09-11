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
import { useClipboard, useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconCalendarCheck,
  IconCalendarDot,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClipboard,
  IconClipboardCheck,
  IconDotsVertical,
  IconFilter,
  IconMapPin,
  IconRefresh,
  IconSitemap,
  IconUser,
  IconX,
} from "@tabler/icons-react";

import { DateSelectorModal } from "@/components/DateSelectorModal";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { useReportActivity } from "@/components/ActivityBar";
import { useColdStartContent } from "@/components/ColdStartReady";
import { FilterModal, type FilterGroup } from "@/components/FilterModal";
import { FAB_ICON_SIZE, FloatingActionButton, FloatingToolbar } from "@/components/FloatingToolbar";
import { LoadingStatus } from "@/components/LoadingStatus";
import type { CalendarEvent } from "@/lib/events/queries";
import { CONTENT_ENTER_CLASS, useContentEnter } from "@/lib/loading/contentEnter";
import { useMinSkeletonHold } from "@/lib/loading/minHoldLoading";
import { type Rect } from "@/lib/motion/origin";
import { MOTION } from "@/lib/motion/timing";
import {
  buildDepartmentTree,
  departmentPathLabels,
  departmentTreeRows,
  type DepartmentTreeNode,
} from "@/lib/roster/hierarchy";
import { formatFullName } from "@/lib/settings/formatName";
import { activatable } from "@/lib/ui/activatable";
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
import { formatEventTimeBadge } from "./eventTimeBadge";
import { ParadeStateDepartmentSkeleton } from "./paradeStateSkeleton";

interface ParadeStateUser {
  id: string;
  name: string;
  shortname: string | null;
  department: { id: string; name: string; sortOrder?: number } | null;
}

interface ParadeStateEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  outOfCamp: boolean;
  eventType: string | null;
  location: string;
  calendarName: string;
  creatorId: string | null;
  inviteeUserIds: string[];
}

/** A department section of the rendered hierarchy (direct users + sub-sections). */
interface DepartmentSection {
  id: string | null;
  name: string;
  users: ParadeStateUser[];
  children: DepartmentSection[];
}

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
}

function eventCoversDay(event: CalendarEvent, date: string): boolean {
  if (event.payload.allDay) {
    const startDay = event.start.slice(0, 10);
    const endDay = event.end.slice(0, 10);
    const prevDay = dayjs(endDay).subtract(1, "day").format("YYYY-MM-DD");
    return date >= startDay && date <= prevDay;
  }
  return event.start.slice(0, 10) === date;
}

function involvedUserIds(event: ParadeStateEvent): string[] {
  // The attendees only: an organizer who is not attending (not self-invited,
  // outside any tagged department) is not counted on their own out-of-camp
  // listing — they merely own the event.
  return [...new Set(event.inviteeUserIds)];
}

function sortEvents(events: ParadeStateEvent[]): ParadeStateEvent[] {
  return [...events].sort((a, b) => {
    if (a.outOfCamp !== b.outOfCamp) return a.outOfCamp ? -1 : 1;
    return a.start.localeCompare(b.start);
  });
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
  // Reset wipes attendance for every date, so it confirms first like every
  // other destructive action in the app.
  const [resetOpened, { open: openResetConfirm, close: closeResetConfirm }] = useDisclosure(false);

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
      setMonth(nextMonth);
      navigate({ date: nextDate, month: nextMonth });
    } else {
      navigate({ date: nextDate });
    }
  }

  function goToday() {
    const todayMonth = dayjs().format("YYYY-MM");
    setDate(today);
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

  const onlyMeActive = selectedUsers.length === 1 && selectedUsers[0] === currentUser;
  const onlyMeAvailable = filterUsers.some((user) => user.id === currentUser);

  function toggleOnlyMe(checked: boolean) {
    // Search groups: empty selection means "no filter", so unchecked clears
    // the Users filter entirely. Mirrored optimistically (no skeleton).
    const next = checked ? [currentUser] : [];
    setSelectedUsers(next);
    void persistFilters(selectedCalendars, next);
  }

  function clearFilters() {
    setSelectedCalendars([]);
    setSelectedUsers([]);
    void persistFilters([], []);
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
    () =>
      events
        .filter((event) => eventCoversDay(event, date))
        .map((event): ParadeStateEvent => ({
          id: event.id,
          title: event.title,
          start: event.start,
          end: event.end,
          allDay: event.payload.allDay,
          outOfCamp: event.payload.outOfCamp,
          eventType: event.payload.eventType,
          location: event.payload.location,
          calendarName: event.payload.calendarName,
          creatorId: event.payload.creatorId,
          inviteeUserIds: event.payload.inviteeUserIds,
        })),
    [events, date],
  );

  const eventsByUser = useMemo(() => {
    const map = new Map<string, ParadeStateEvent[]>();
    for (const event of dayEvents) {
      // Only include out-of-camp events
      if (!event.outOfCamp) continue;
      for (const userId of involvedUserIds(event)) {
        let list = map.get(userId);
        if (!list) {
          list = [];
          map.set(userId, list);
        }
        list.push(event);
      }
    }
    for (const [userId, evts] of map) {
      map.set(userId, sortEvents(evts));
    }
    return map;
  }, [dayEvents]);

  // The department hierarchy (parents before children, by the shared sortOrder)
  // with each user's direct department section; "Unassigned" stays a terminal
  // top-level section. Headcounts aggregate down the tree at render time.
  const sections: DepartmentSection[] = useMemo(() => {
    const usersByDept = new Map<string, ParadeStateUser[]>();
    const unassigned: ParadeStateUser[] = [];

    for (const user of users) {
      if (user.department) {
        const list = usersByDept.get(user.department.id) ?? [];
        list.push(user);
        usersByDept.set(user.department.id, list);
      } else {
        unassigned.push(user);
      }
    }

    const tree = buildDepartmentTree(
      calendars.map((calendar) => ({
        id: calendar.id,
        name: calendar.name,
        sortOrder: calendar.sortOrder ?? 0,
        parentId: calendar.parentId,
      })),
    );
    const mapNode = (node: DepartmentTreeNode): DepartmentSection => ({
      id: node.id,
      name: node.name,
      users: usersByDept.get(node.id) ?? [],
      children: node.children.map(mapNode),
    });

    return [
      ...tree.map(mapNode),
      { id: null, name: "Unassigned", users: unassigned, children: [] },
    ];
  }, [users, calendars]);

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
      __vars={{ "--button-height": "43px" }}
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
                  border: checked
                    ? "none"
                    : "1.5px solid var(--mantine-color-gray-5)",
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
          {section.name} — {presentCount}/{headcount.total}{" "}
          {attendanceMode ? "present" : "in camp"}
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
  const onToday = date === today;

  return (
    // fab-page-pad replaces pb="xl": reserves clearance for the mobile
    // attendance FAB below the last card row, restores plain xl at lg.
    <Stack gap="md" className="fab-page-pad">
      <PageHeader title="Parade State" subtitle="Roster whereabouts and attendance, by day." />
      <Group align="center" gap="xs" wrap="nowrap">
        <ActionIcon
          size={43}
          variant="default"
          aria-label="Previous day"
          onClick={() => shiftDay(-1)}
        >
          <IconChevronLeft size={18} />
        </ActionIcon>
        <Text
          fw={600}
          size="lg"
          lineClamp={1}
          style={{ flex: 1, minWidth: 0, textAlign: "center" }}
        >
          {dayLabel}
        </Text>
        <ActionIcon size={43} variant="default" aria-label="Next day" onClick={() => shiftDay(1)}>
          <IconChevronRight size={18} />
        </ActionIcon>
        {desktopAttendanceButton}
        <Menu
          shadow="md"
          width={200}
          position="bottom-end"
          transitionProps={{
            transition: "pop-top-right",
            duration: MOTION.popover,
            timingFunction: "ease",
          }}
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
            <Menu.Item leftSection={<IconCalendarDot size={16} />} onClick={openPicker}>
              Select date
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
              onClick={(e) => {
                setFilterOriginRect(e.currentTarget.getBoundingClientRect());
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
          </Menu.Dropdown>
        </Menu>
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

      <Box ref={contentRef} className={CONTENT_ENTER_CLASS}>
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

      {/* The attendance FAB is mobile-only; at lg the entry point is the
          nav-row button beside the kebab menu. hiddenFrom sits on the toolbar
          itself: its Affix portals to <body>, so a wrapper element could not
          hide it. */}
      <FloatingToolbar hiddenFrom="lg">
        <FloatingActionButton
          aria-label={attendanceMode ? "Exit attendance mode" : "Start attendance"}
          variant={attendanceMode ? "light" : undefined}
          color={attendanceMode ? "teal" : undefined}
          onClick={attendanceMode ? exitAttendance : enterAttendance}
        >
          {attendanceMode ? <IconCheck size={FAB_ICON_SIZE} /> : <IconClipboardCheck size={FAB_ICON_SIZE} />}
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
