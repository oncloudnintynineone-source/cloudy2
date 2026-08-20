"use client";

import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ActionIcon,
  Badge,
  Box,
  Group,
  Menu,
  Paper,
  Stack,
  Text,
  useComputedColorScheme,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconCalendarCheck,
  IconChevronLeft,
  IconChevronRight,
  IconDotsVertical,
  IconFilter,
  IconUser,
} from "@tabler/icons-react";

import { FilterModal, type FilterGroup } from "@/components/FilterModal";
import type { CalendarEvent } from "@/lib/events/queries";
import { CONTENT_ENTER_CLASS, useContentEnter } from "@/lib/loading/contentEnter";
import { useMinSkeletonHold } from "@/lib/loading/minHoldLoading";
import { formatFullName } from "@/lib/settings/formatName";

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
  filterUsers: { id: string; displayName: string }[];
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
    navigate({
      cal: calIds.length > 0 ? calIds.join(",") : null,
      users: userIds.length > 0 ? userIds.join(",") : null,
      types: null,
    });
  }

  const filterGroups: FilterGroup[] = useMemo(() => {
    const groups: FilterGroup[] = [
      { label: "Calendars", options: calendars.map((c) => ({ value: c.id, label: c.name })) },
    ];
    const userOptions = filterUsers.map((user) => ({ value: user.id, label: user.displayName }));
    if (userOptions.length > 0) {
      groups.push({
        label: "Users",
        options: userOptions,
        variant: "search",
        action: filterUsers.some((user) => user.id === currentUser)
          ? {
              label: "Only me",
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

  const dayLabel = dayjs(date).format("ddd, MMM D, YYYY");
  const onToday = date === today;

  return (
    <Stack gap="md" p="md" pb="xl">
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
              Filters
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
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
              return (
                <Box key={dept.id ?? "__unassigned__"}>
                  <Text fw={700} size="sm" c="dimmed" mb="xs" tt="uppercase" lh={1}>
                    {dept.name} ({headcount.present}/{headcount.total})
                  </Text>
                  <Stack gap="xs">
                    {dept.users.map((user) => {
                      const userEvents = eventsByUser.get(user.id) ?? [];
                      const displayName = formatFullName(
                        { name: user.name, departmentName: user.department?.name ?? null },
                        nameTemplate,
                      );
                      return (
                        <Paper
                          key={user.id}
                          withBorder
                          p="sm"
                          style={
                            userEvents.length > 0
                              ? {
                                  backgroundColor: colorScheme === "dark" ? "#3d3200" : "#fff8e1",
                                  borderColor: "var(--mantine-color-yellow-4)",
                                }
                              : undefined
                          }
                        >
                          <Stack gap={2}>
                            <Text fw={600} size="sm">
                              {displayName}
                            </Text>
                            {userEvents.length === 0 ? (
                              <Text size="xs" c="dimmed">
                                No events
                              </Text>
                            ) : (
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
                    })}
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        )}
      </Box>

      <FilterModal
        opened={filterOpened}
        onClose={closeFilter}
        title="Filters"
        groups={filterGroups}
        values={filterValues}
        onApply={handleApplyFilters}
      />
    </Stack>
  );
}
