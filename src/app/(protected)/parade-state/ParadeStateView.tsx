"use client";

import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  Group,
  Menu,
  Modal,
  Paper,
  Pill,
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
  IconUser,
  IconX,
} from "@tabler/icons-react";

import { DateSelectorModal } from "@/components/DateSelectorModal";
import { FilterModal, type FilterGroup } from "@/components/FilterModal";
import { FAB_ICON_SIZE, FloatingActionButton, FloatingToolbar } from "@/components/FloatingToolbar";
import type { CalendarEvent } from "@/lib/events/queries";
import { CONTENT_ENTER_CLASS, useContentEnter } from "@/lib/loading/contentEnter";
import { useMinSkeletonHold } from "@/lib/loading/minHoldLoading";
import { formatFullName } from "@/lib/settings/formatName";
import { activatable } from "@/lib/ui/activatable";
import { PARADE_STATE_KEYS, freshMarkerNeeded } from "@/lib/ui/uiState";
import { usePersistUiState } from "@/lib/ui/uiStateClient";

import { buildAttendanceReport } from "./attendanceReport";
import { clearAttendance, loadAttendanceRecord, saveAttendanceIds } from "./attendanceStorage";
import { departmentHeadcount } from "./headcount";
import { formatEventTimeBadge } from "./eventTimeBadge";
import { ParadeStateDepartmentSkeleton } from "./paradeStateSkeleton";

interface ParadeStateUser {
  id: string;
  name: string;
  shortname: string | null;
  department: { id: string; name: string } | null;
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

interface ParadeStateDepartment {
  id: string | null;
  name: string;
  users: ParadeStateUser[];
}

export interface ParadeStateViewProps {
  date: string;
  month: string;
  users: ParadeStateUser[];
  events: CalendarEvent[];
  calendars: { id: string; name: string }[];
  currentUser: string;
  selectedCalendarIds: string[];
  selectedUserIds: string[];
  filterUsers: { id: string; name: string; displayName: string; departmentName: string | null }[];
  nameTemplate: string;
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
  const ids = new Set<string>();
  if (event.creatorId) {
    ids.add(event.creatorId);
  }
  for (const id of event.inviteeUserIds) {
    ids.add(id);
  }
  return [...ids];
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
  const contentRef = useRef<HTMLDivElement | null>(null);
  useContentEnter(contentRef, !contentLoading);

  // Remembered UI state: persist the server-resolved day/filters to the
  // per-device cookie on every change, so a relaunch (or F5) lands on exactly
  // this state (see src/lib/ui/uiState.ts).
  usePersistUiState("parade", {
    date: initialDate,
    month: initialMonth,
    cal: initSelectedCalendars,
    users: initSelectedUsers,
  });

  // Attendance mode: checked users are kept per shown date in localStorage
  // (never the database). The full record is read when the mode is entered
  // and kept in memory from then on; `checkedIds` is derived for the shown
  // date, so day switches swap rosters without any reload.
  const [attendanceMode, setAttendanceMode] = useState(false);
  const [attendance, setAttendance] = useState<Record<string, string[]>>({});
  const clipboard = useClipboard();

  const checkedIds = useMemo(() => new Set(attendance[date] ?? []), [attendance, date]);

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
      // When this navigation removes remembered keys (Clear, unchecking
      // "My Events"), the one-shot `_fresh` marker makes this one render use
      // pure defaults instead of the now-stale remembered-state cookie; the
      // state effect re-persists the freshly resolved values right after.
      startTransition(() => {
        router.push(
          freshMarkerNeeded(updates, PARADE_STATE_KEYS)
            ? buildHref({ ...updates, _fresh: "1" })
            : buildHref(updates),
        );
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

  // Strip the one-shot `_fresh` marker after its render has mounted (self-
  // terminating, plain push — no skeleton for a URL-only change), so the
  // marker never survives into back/forward history.
  useEffect(() => {
    if (searchParams.get("_fresh") === null) {
      return;
    }
    router.push(buildHref({ _fresh: null }));
  }, [buildHref, router, searchParams]);

  function handleApplyFilters(values: Record<string, string[]>) {
    const calIds = values["Calendars"] ?? [];
    const userIds = values["Users"] ?? [];
    setSelectedCalendars(calIds);
    setSelectedUsers(userIds);
    navigate({
      cal: calIds.length > 0 ? calIds.join(",") : null,
      users: userIds.length > 0 ? userIds.join(",") : null,
      types: null,
    });
  }

  const onlyMeActive = selectedUsers.length === 1 && selectedUsers[0] === currentUser;
  const onlyMeAvailable = filterUsers.some((user) => user.id === currentUser);

  function toggleOnlyMe(checked: boolean) {
    // Search groups: empty selection means "no filter", so unchecked clears
    // the Users filter entirely. Mirrored optimistically (no skeleton).
    const next = checked ? [currentUser] : [];
    setSelectedUsers(next);
    navigate({ users: next.length > 0 ? next.join(",") : null });
  }

  function clearFilters() {
    setSelectedCalendars([]);
    setSelectedUsers([]);
    navigate({ cal: null, users: null, types: null });
  }

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
        variant: "search",
        action: filterUsers.some((user) => user.id === currentUser)
          ? {
              label: "My Events",
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

  const calendarsFiltered =
    selectedCalendars.length > 0 && selectedCalendars.length < calendars.length;

  // Per-chip removal mirrors the Users tab: drop one value from the applied
  // filter and navigate with the remainder (empty → param removed).
  function removeFilterValue(group: "cal" | "users", value: string) {
    if (group === "cal") {
      const next = selectedCalendars.filter((id) => id !== value);
      setSelectedCalendars(next);
      navigate({ cal: next.length > 0 ? next.join(",") : null });
      return;
    }
    const next = selectedUsers.filter((id) => id !== value);
    setSelectedUsers(next);
    navigate({ users: next.length > 0 ? next.join(",") : null });
  }

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

  const departments: ParadeStateDepartment[] = useMemo(() => {
    const deptMap = new Map<string, ParadeStateDepartment>();
    const unassigned: ParadeStateDepartment = { id: null, name: "Unassigned", users: [] };

    for (const user of users) {
      if (user.department) {
        let dept = deptMap.get(user.department.id);
        if (!dept) {
          dept = { id: user.department.id, name: user.department.name, users: [] };
          deptMap.set(user.department.id, dept);
        }
        dept.users.push(user);
      } else {
        unassigned.users.push(user);
      }
    }

    const result = [...deptMap.values()].sort((a, b) => a.name.localeCompare(b.name));
    if (unassigned.users.length > 0) {
      result.push(unassigned);
    }
    return result;
  }, [users]);

  function enterAttendance() {
    setAttendance(loadAttendanceRecord());
    setAttendanceMode(true);
  }

  function toggleAttendance(userId: string) {
    const current = new Set(attendance[date] ?? []);
    if (current.has(userId)) {
      current.delete(userId);
    } else {
      current.add(userId);
    }
    const ids = [...current];
    saveAttendanceIds(date, ids);
    setAttendance((prev) => ({ ...prev, [date]: ids }));
  }

  // Reset clears every date's checks, not just the shown day's.
  function resetAttendance() {
    clearAttendance();
    setAttendance({});
  }

  async function copyAttendanceReport() {
    // Full names (raw roster names, not the display-name template); a checked
    // user renders bare (present) regardless of their calendar.
    const text = buildAttendanceReport(
      departments.map((dept) => ({
        name: dept.name,
        users: dept.users.map((user) => ({ id: user.id, name: user.name })),
      })),
      checkedIds,
    );
    try {
      await clipboard.copy(text);
      notifications.show({ color: "green", message: "Parade state copied to clipboard" });
    } catch {
      notifications.show({ color: "red", message: "Could not copy to clipboard" });
    }
  }

  const attendanceMenuItems = (
    <>
      <Menu.Item leftSection={<IconRefresh size={16} />} onClick={openResetConfirm}>
        Reset
      </Menu.Item>
      <Menu.Item
        leftSection={<IconClipboard size={16} />}
        onClick={() => void copyAttendanceReport()}
      >
        Copy to Clipboard
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item leftSection={<IconX size={16} />} onClick={() => setAttendanceMode(false)}>
        Exit
      </Menu.Item>
    </>
  );

  // Desktop: the attendance entry point lives beside the kebab menu instead of
  // the bottom corner FAB — same convention as the dashboard's nav-row
  // "New event" button. In attendance mode it becomes the options menu target.
  const desktopAttendanceButton = (
    <Button
      visibleFrom="lg"
      __vars={{ "--button-height": "43px" }}
      leftSection={<IconClipboardCheck size={16} />}
      onClick={attendanceMode ? undefined : enterAttendance}
    >
      Attendance
    </Button>
  );

  const dayLabel = dayjs(date).format("ddd, MMM D, YYYY");
  const onToday = date === today;

  return (
    // fab-page-pad replaces pb="xl": reserves clearance for the mobile
    // attendance FAB below the last card row, restores plain xl at lg.
    <Stack gap="md" p="md" className="fab-page-pad">
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
        {attendanceMode ? (
          <Menu
            shadow="md"
            width={220}
            position="bottom-end"
            transitionProps={{ transition: "pop-top-right", duration: 150, timingFunction: "ease" }}
          >
            <Menu.Target>{desktopAttendanceButton}</Menu.Target>
            <Menu.Dropdown>{attendanceMenuItems}</Menu.Dropdown>
          </Menu>
        ) : (
          desktopAttendanceButton
        )}
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
            <Menu.Item leftSection={<IconCalendarDot size={16} />} onClick={openPicker}>
              Select date
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
          </Menu.Dropdown>
        </Menu>
      </Group>

      {(calendarsFiltered || selectedUsers.length > 0) && (
        <Group gap={6} wrap="wrap">
          {calendarsFiltered &&
            selectedCalendars.map((id) => {
              const cal = calendars.find((entry) => entry.id === id);
              return (
                <Pill key={id} withRemoveButton onRemove={() => removeFilterValue("cal", id)}>
                  {cal?.name ?? id}
                </Pill>
              );
            })}
          {selectedUsers.map((id) => {
            const user = filterUsers.find((entry) => entry.id === id);
            return (
              <Pill key={id} withRemoveButton onRemove={() => removeFilterValue("users", id)}>
                {user?.displayName ?? id}
              </Pill>
            );
          })}
        </Group>
      )}

      {/* Status legend + attendance day total: the card colors carry real
          meaning, so they are named in text (color-blind safe) and the
          overall present count is visible without scanning departments. */}
      <Group justify="space-between" gap="sm" wrap="nowrap">
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
        {attendanceMode && (
          <Text size="xs" fw={600} style={{ flexShrink: 0 }}>
            {users.filter((user) => checkedIds.has(user.id)).length}/{users.length} present
          </Text>
        )}
      </Group>

      <Box ref={contentRef} className={CONTENT_ENTER_CLASS}>
        {contentLoading ? (
          <Stack gap="lg">
            <ParadeStateDepartmentSkeleton users={2} />
            <ParadeStateDepartmentSkeleton users={3} />
          </Stack>
        ) : departments.length === 0 ? (
          <Text c="dimmed" ta="center" py="lg">
            No departments found.
          </Text>
        ) : departments.every((dept) => dept.users.length === 0) ? (
          <Text c="dimmed" ta="center" py="lg">
            No users found.
          </Text>
        ) : (
          <Stack gap="lg">
            {departments.map((dept) => {
              if (dept.users.length === 0) return null;
              const headcount = departmentHeadcount(dept.users, eventsByUser);
              const presentCount = attendanceMode
                ? dept.users.filter((user) => checkedIds.has(user.id)).length
                : headcount.present;
              return (
                <Box key={dept.id ?? "__unassigned__"}>
                  <Text fw={700} size="sm" c="dimmed" mb="xs" tt="uppercase" lh={1}>
                    {dept.name} ({presentCount}/{headcount.total})
                  </Text>
                  {/* Single column on mobile; auto-filling card grid at lg
                      (see .card-grid in globals.css). */}
                  <Box component="div" className="card-grid">
                    {dept.users.map((user) => {
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
                          style={{
                            cursor: attendanceMode ? "pointer" : undefined,
                            ...(checked
                              ? {
                                  backgroundColor: colorScheme === "dark" ? "#10281b" : "#e8f5e9",
                                  borderColor: "var(--mantine-color-green-4)",
                                }
                              : userEvents.length > 0
                                ? {
                                    backgroundColor:
                                      colorScheme === "dark" ? "#3d3200" : "#fff8e1",
                                    borderColor: "var(--mantine-color-yellow-4)",
                                  }
                                : {}),
                          }}
                        >
                          <Stack gap={2}>
                            <Group gap="xs" wrap="nowrap" align="center">
                              {attendanceMode && (
                                // Clicks stop here: toggling the checkbox must
                                // not also fire the card-level toggle.
                                <Box
                                  onClick={(event) => event.stopPropagation()}
                                  style={{ flexShrink: 0 }}
                                >
                                  <Checkbox
                                    checked={checkedIds.has(user.id)}
                                    onChange={() => toggleAttendance(user.id)}
                                    aria-label={`Mark ${user.name} as present`}
                                  />
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
                              {attendanceMode && checkedIds.has(user.id) && (
                                <IconCheck
                                  size={14}
                                  color="var(--mantine-color-teal-6)"
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
                                    <Text
                                      size="xs"
                                      fw={400}
                                      c="dimmed"
                                      style={{ flex: 1, minWidth: 0 }}
                                    >
                                      {event.title}
                                    </Text>
                                  </Group>
                                ))}
                              </Stack>
                            )}
                          </Stack>
                        </Paper>
                      );
                    })}
                  </Box>
                </Box>
              );
            })}
          </Stack>
        )}
      </Box>

      {/* The attendance FAB is mobile-only; at lg the entry point is the
          nav-row button beside the kebab menu. hiddenFrom sits on the toolbar
          itself: its Affix portals to <body>, so a wrapper element could not
          hide it. */}
      <FloatingToolbar hiddenFrom="lg">
        {attendanceMode ? (
          <Menu
            shadow="md"
            width={220}
            position="top-end"
            transitionProps={{
              transition: "pop-top-right",
              duration: 150,
              timingFunction: "ease",
            }}
          >
            <Menu.Target>
              <FloatingActionButton aria-label="Attendance options">
                <IconClipboardCheck size={FAB_ICON_SIZE} />
              </FloatingActionButton>
            </Menu.Target>
            <Menu.Dropdown>{attendanceMenuItems}</Menu.Dropdown>
          </Menu>
        ) : (
          <FloatingActionButton aria-label="Start attendance" onClick={enterAttendance}>
            <IconClipboardCheck size={FAB_ICON_SIZE} />
          </FloatingActionButton>
        )}
      </FloatingToolbar>

      <FilterModal
        opened={filterOpened}
        onClose={closeFilter}
        title="Filters"
        groups={filterGroups}
        values={filterValues}
        onApply={handleApplyFilters}
      />
      <DateSelectorModal
        opened={pickerOpened}
        date={date}
        onPick={pickDate}
        onClose={closePicker}
      />
      <Modal opened={resetOpened} onClose={closeResetConfirm} title="Reset attendance" centered>
        <Text>
          Clear attendance checks for every date? This cannot be undone.
        </Text>
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
            Reset
          </Button>
        </Group>
      </Modal>
    </Stack>
  );
}
