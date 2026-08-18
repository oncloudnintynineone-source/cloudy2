"use client";

import { useCallback, useMemo, useTransition } from "react";
import dayjs from "dayjs";
import { ActionIcon, Alert, Button, Group, Paper, ScrollArea, Stack, Text, useComputedColorScheme } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconChevronLeft, IconChevronRight, IconUser } from "@tabler/icons-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FilterButton } from "@/components/FilterButton";
import { FilterModal, type FilterGroup } from "@/components/FilterModal";

interface OverviewUser {
  id: string;
  label: string;
  fullName: string;
}

interface OverviewDepartment {
  id: string;
  name: string;
  users: OverviewUser[];
}

interface OverviewViewProps {
  month: string;
  googleConfigured: boolean;
  departments: OverviewDepartment[];
  typeNames: string[];
  counts: Record<string, Record<string, number>>;
  calendars: { id: string; name: string }[];
  eventTypes: string[];
  inviteeUsers: { id: string; displayName: string }[];
  selectedCalendarIds: string[];
  selectedTypes: string[];
  selectedUserIds: string[];
  currentUser: string;
}

// Mirror the dashboard ResourcesDayView sizing overrides (DashboardView.tsx):
// 1.5rem group (department) column, 3rem resource (short name) column, 56px rows.
const GROUP_COL_WIDTH = "1.5rem";
const RESOURCE_COL_WIDTH = "3rem";
const TYPE_COL_WIDTH = 80;
const ROW_HEIGHT = 56;

const borderColor = "var(--mantine-color-default-border)";
const bodyBg = "var(--mantine-color-body)";

const countCellStyle: React.CSSProperties = {
  minHeight: ROW_HEIGHT,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 4px",
  textAlign: "center",
  fontSize: 13,
  fontVariantNumeric: "tabular-nums",
  borderBottom: `1px solid ${borderColor}`,
};

export function OverviewView({
  month,
  googleConfigured,
  departments,
  typeNames,
  counts,
  calendars,
  eventTypes,
  inviteeUsers,
  selectedCalendarIds,
  selectedTypes,
  selectedUserIds,
  currentUser,
}: OverviewViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const colorScheme = useComputedColorScheme("light");
  const [filterOpened, { open: openFilter, close: closeFilter }] = useDisclosure(false);

  const departmentBg = (hue: number) =>
    colorScheme === "dark" ? `hsl(${hue} 45% 20%)` : `hsl(${hue} 70% 93%)`;
  const departmentLabelBg = (hue: number) =>
    colorScheme === "dark" ? `hsl(${hue} 50% 26%)` : `hsl(${hue} 60% 90%)`;

  const monthLabel = dayjs(`${month}-01`).format("MMMM YYYY");
  const todayMonth = dayjs().format("YYYY-MM");
  const userCount = departments.reduce((total, dept) => total + dept.users.length, 0);

  const navigate = useCallback(
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
      startTransition(() => {
        router.push(query ? `${pathname}?${query}` : pathname);
      });
    },
    [searchParams, pathname, router, startTransition],
  );

  function goToMonth(next: string) {
    navigate({ month: next === todayMonth ? null : next });
  }

  const filterGroups: FilterGroup[] = useMemo(() => {
    const groups: FilterGroup[] = [
      { label: "Calendars", options: calendars.map((c) => ({ value: c.id, label: c.name })) },
    ];
    const userOptions = inviteeUsers.map((user) => ({
      value: user.id,
      label: user.displayName,
    }));
    if (userOptions.length > 0) {
      groups.push({
        label: "Users",
        options: userOptions,
        variant: "search",
        action: {
          label: "Only me",
          icon: <IconUser size={14} />,
          isApplied: (selected) => selected.length === 1 && selected[0] === currentUser,
          apply: (setValues, { selected }) => {
            const isActive = selected.length === 1 && selected[0] === currentUser;
            setValues(isActive ? [] : [currentUser]);
          },
        },
      });
    }
    if (eventTypes.length > 0) {
      groups.push({
        label: "Event Types",
        options: eventTypes.map((name) => ({ value: name, label: name })),
      });
    }
    return groups;
  }, [calendars, inviteeUsers, currentUser, eventTypes]);

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

  return (
    <Stack pb="xl" gap="sm">
      <Group justify="space-between" align="center">
        <Group gap="xs">
          <ActionIcon
            variant="default"
            aria-label="Previous month"
            onClick={() => goToMonth(dayjs(`${month}-01`).subtract(1, "month").format("YYYY-MM"))}
          >
            <IconChevronLeft size={18} />
          </ActionIcon>
          <Text fw={600} size="lg">
            {monthLabel}
          </Text>
          <ActionIcon
            variant="default"
            aria-label="Next month"
            onClick={() => goToMonth(dayjs(`${month}-01`).add(1, "month").format("YYYY-MM"))}
          >
            <IconChevronRight size={18} />
          </ActionIcon>
        </Group>
        <Group gap="xs">
          <Button variant="default" size="xs" color="black" h={43} onClick={() => goToMonth(todayMonth)}>
            Today
          </Button>
          <FilterButton activeCount={activeFilterCount} onClick={openFilter} />
        </Group>
      </Group>

      {!googleConfigured && (
        <Alert color="yellow" title="Google Calendar is not configured">
          Events cannot be read until Google service-account credentials are set.
        </Alert>
      )}

      {userCount === 0 ? (
        <Paper withBorder radius="md" p="lg">
          <Text size="sm" c="dimmed">
            No users to show. Assign yourself to a department (Admin Settings) or add active users.
          </Text>
        </Paper>
      ) : typeNames.length === 0 ? (
        <Paper withBorder radius="md" p="lg">
          <Text size="sm" c="dimmed">
            No event types configured yet — add them under Admin Settings, then create events.
          </Text>
        </Paper>
      ) : (
        <Paper
          withBorder
          radius="md"
          style={{ overflow: "hidden", opacity: isPending ? 0.6 : 1, transition: "opacity 150ms ease" }}
        >
          <ScrollArea style={{ height: "min(60vh, 520px)" }} type="auto">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `${GROUP_COL_WIDTH} ${RESOURCE_COL_WIDTH} repeat(${typeNames.length}, ${TYPE_COL_WIDTH}px)`,
                minWidth: "100%",
                width: "max-content",
                alignItems: "stretch",
              }}
            >
              <div
                style={{
                  gridColumn: `1 / span 2`,
                  gridRow: 1,
                  position: "sticky",
                  top: 0,
                  left: 0,
                  zIndex: 4,
                  background: bodyBg,
                  borderBottom: `1px solid ${borderColor}`,
                  borderInlineEnd: `1px solid ${borderColor}`,
                  minHeight: 40,
                }}
              />
              {typeNames.map((name, i) => (
                <div
                  key={name}
                  style={{
                    gridColumn: i + 3,
                    gridRow: 1,
                    position: "sticky",
                    top: 0,
                    zIndex: 3,
                    background: bodyBg,
                    borderBottom: `1px solid ${borderColor}`,
                    minHeight: 40,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 4px",
                    textAlign: "center",
                    fontSize: 13,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={name}
                >
                  {name}
                </div>
              ))}
              {(() => {
                const rows: React.ReactNode[] = [];
                let row = 2;
                const hueStep = departments.length > 0 ? 360 / departments.length : 0;
                departments.forEach((dept, deptIndex) => {
                  const rowStart = row;
                  const hue = deptIndex * hueStep;
                  for (const user of dept.users) {
                    rows.push(
                      <div
                        key={`${user.id}-name`}
                        style={{
                          gridColumn: 2,
                          gridRow: row,
                          position: "sticky",
                          left: GROUP_COL_WIDTH,
                          zIndex: 1,
                          background: departmentBg(hue),
                          borderInlineEnd: `1px solid ${borderColor}`,
                          borderBottom: `1px solid ${borderColor}`,
                          minHeight: ROW_HEIGHT,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "0 2px",
                          fontSize: 13,
                          fontWeight: 500,
                          userSelect: "none",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={user.label === user.fullName ? undefined : user.fullName}
                      >
                        {user.label}
                      </div>,
                    );
                    typeNames.forEach((name, i) => {
                      rows.push(
                        <div
                          key={`${user.id}-${name}`}
                          style={{
                            ...countCellStyle,
                            background: departmentBg(hue),
                            gridColumn: i + 3,
                            gridRow: row,
                          }}
                        >
                          {counts[user.id]?.[name] ?? 0}
                        </div>,
                      );
                    });
                    row += 1;
                  }
                  rows.push(
                    <div
                      key={dept.id}
                      style={{
                        gridColumn: 1,
                        gridRow: `${rowStart} / span ${dept.users.length}`,
                        position: "sticky",
                        left: 0,
                        zIndex: 2,
                        background: departmentLabelBg(hue),
                        borderInlineEnd: `1px solid ${borderColor}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        textAlign: "center",
                        fontSize: 13,
                        fontWeight: 500,
                        userSelect: "none",
                        overflow: "hidden",
                      }}
                      title={dept.name}
                    >
                      <span style={{ writingMode: "vertical-rl" }}>{dept.name}</span>
                    </div>,
                  );
                });
                return rows;
              })()}
            </div>
          </ScrollArea>
        </Paper>
      )}

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
