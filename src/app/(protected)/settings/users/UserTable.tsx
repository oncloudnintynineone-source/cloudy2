"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Pill,
  Stack,
  Table,
  Text,
  TextInput,
  useMantineTheme,
  VisuallyHidden,
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { IconPlus, IconSearchOff, IconUsers } from "@tabler/icons-react";

import { EmptyState } from "@/components/EmptyState";
import { useActivityRefresh } from "@/components/ActivityBar";
import { FilterButton } from "@/components/FilterButton";
import { FilterModal, type FilterGroup } from "@/components/FilterModal";
import { FAB_ICON_SIZE, FloatingActionButton, FloatingToolbar } from "@/components/FloatingToolbar";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import { type Rect } from "@/lib/motion/origin";
import type { RosterAccessGrant, RosterUser } from "@/lib/roster/queries";
import { departmentPathLabels, departmentTreeRows } from "@/lib/roster/hierarchy";
import { formatFullName } from "@/lib/settings/formatName";
import { activatable } from "@/lib/ui/activatable";
import { UserForm, type DepartmentOption } from "./UserForm";

interface UserTableProps {
  users: RosterUser[];
  departments: DepartmentOption[];
  /** Cross-department grants grouped by user id (empty for a fresh user). */
  accessByUser: Record<string, RosterAccessGrant[]>;
  nameTemplate: string;
}

export function UserTable({ users, departments, accessByUser, nameTemplate }: UserTableProps) {
  const refreshAfterSave = useActivityRefresh("users:save");
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const [opened, { open, close }] = useDisclosure(false);
  const [filterOpened, { open: openFilter, close: closeFilter }] = useDisclosure(false);
  // Where the filter trigger sat on screen; the dialog grows out of / shrinks
  // back into it (see src/lib/motion/origin.ts).
  const [filterOriginRect, setFilterOriginRect] = useState<Rect | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState<string[]>([]);
  const [editingUser, setEditingUser] = useState<RosterUser | null>(null);

  // Department rows (preorder + full ancestor-path labels) for the Department
  // chip filter — children read as "HQ › Logistics" inside the chip itself.
  const departmentOptions = useMemo(() => {
    const rows = departmentTreeRows(
      departments.map((department) => ({
        id: department.id,
        name: department.name,
        sortOrder: department.sortOrder ?? 0,
        parentId: department.parentId,
      })),
    );
    const labels = departmentPathLabels(rows);
    return rows.map((row) => ({ value: row.id, label: labels.get(row.id) ?? row.name }));
  }, [departments]);

  const filterGroups: FilterGroup[] = useMemo(
    () => [
      {
        label: "Status",
        options: [
          { value: "active", label: "Active" },
          { value: "inactive", label: "Inactive" },
        ],
      },
      {
        label: "Department",
        options: departmentOptions,
      },
    ],
    [departmentOptions],
  );

  const filterValues: Record<string, string[]> = useMemo(
    () => ({ Status: statusFilter, Department: departmentFilter }),
    [statusFilter, departmentFilter],
  );

  const activeFilterCount = Object.values(filterValues).filter(
    (values) => values.length > 0,
  ).length;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((user) => {
      if (statusFilter.length > 0 && !statusFilter.includes(user.status)) {
        return false;
      }
      if (
        departmentFilter.length > 0 &&
        (!user.department?.id || !departmentFilter.includes(user.department.id))
      ) {
        return false;
      }
      if (
        query &&
        !user.name.toLowerCase().includes(query) &&
        !(user.shortname ?? "").toLowerCase().includes(query) &&
        !user.phone.includes(query)
      ) {
        return false;
      }
      return true;
    });
  }, [users, search, statusFilter, departmentFilter]);

  function handleApplyFilters(values: Record<string, string[]>) {
    setStatusFilter(values.Status ?? []);
    setDepartmentFilter(values.Department ?? []);
  }

  function clearAllFilters() {
    setStatusFilter([]);
    setDepartmentFilter([]);
  }

  function openCreate() {
    setEditingUser(null);
    open();
  }

  function openEdit(user: RosterUser) {
    setEditingUser(user);
    open();
  }

  return (
    <Stack pb="xl" className={CONTENT_ENTER_CLASS}>
      <Paper withBorder p="sm">
        <Stack gap="xs">
          <Group justify="space-between" wrap="nowrap">
            <TextInput
              aria-label="Search users by name or phone"
              placeholder="Search by name or phone"
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <FilterButton
              activeCount={activeFilterCount}
              onClick={(e) => {
                setFilterOriginRect(e.currentTarget.getBoundingClientRect());
                openFilter();
              }}
            />
            {/* Desktop: full-size create button instead of the FAB (like the
                Calendar page's "New event" button); the FAB below is mobile-only. */}
            <Button
              visibleFrom="lg"
              __vars={{ "--button-height": "43px" }}
              leftSection={<IconPlus size={16} />}
              onClick={openCreate}
            >
              Add user
            </Button>
          </Group>
          {activeFilterCount > 0 ? (
            <Group gap={6} wrap="wrap">
              {statusFilter.map((value) => (
                <Pill
                  key={value}
                  withRemoveButton
                  onRemove={() =>
                    setStatusFilter((values) => values.filter((entry) => entry !== value))
                  }
                >
                  Status: {value === "active" ? "Active" : "Inactive"}
                </Pill>
              ))}
              {departmentFilter.map((value) => {
                const department = departments.find((d) => d.id === value);
                return (
                  <Pill
                    key={value}
                    withRemoveButton
                    onRemove={() =>
                      setDepartmentFilter((values) => values.filter((entry) => entry !== value))
                    }
                  >
                    {department?.name ?? value}
                  </Pill>
                );
              })}
              <Button size="xs" variant="subtle" onClick={clearAllFilters}>
                Clear all
              </Button>
            </Group>
          ) : null}
        </Stack>
      </Paper>

      {filtered.length === 0 ? (
        search.trim() !== "" || activeFilterCount > 0 ? (
          <EmptyState
            icon={<IconSearchOff size={18} />}
            description="No users match your search or filters."
            actionLabel="Clear search & filters"
            onAction={() => {
              setSearch("");
              clearAllFilters();
            }}
          />
        ) : (
          <EmptyState
            icon={<IconUsers size={18} />}
            description="No users yet."
            actionLabel="Add user"
            onAction={openCreate}
          />
        )
      ) : (
        <>
          {/* Mobile: card list */}
          <Stack gap="sm" hiddenFrom="lg">
            {filtered.map((user) => (
              <Paper
                key={user.id}
                withBorder
                p="sm"
                onClick={() => openEdit(user)}
                {...activatable(() => openEdit(user))}
                style={{ cursor: "pointer" }}
              >
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Stack gap={0}>
                    <Text fw={600}>{user.name}</Text>
                    <Text size="sm" c="dimmed">
                      {formatFullName(
                        { name: user.name, departmentName: user.department?.name ?? null },
                        nameTemplate,
                      )}
                    </Text>
                  </Stack>
                  <Badge color={user.status === "active" ? "green" : "gray"}>
                    {user.status === "active" ? "Active" : "Inactive"}
                  </Badge>
                </Group>
                <Group gap={6} wrap="wrap" mt={4}>
                  {user.shortname ? (
                    <Badge variant="light" color="accent">
                      {user.shortname}
                    </Badge>
                  ) : null}
                  <Text size="sm" c="dimmed">
                    {user.phone}
                  </Text>
                      <Badge color={user.role === "admin" ? "brand" : "gray"}>
                        {user.role === "admin" ? "Admin" : "User"}
                      </Badge>
                  {user.department ? (
                    <Badge variant="light" color="accent">
                      {user.department.name}
                    </Badge>
                  ) : (
                    <Badge variant="outline" color="gray">
                      No department
                    </Badge>
                  )}
                </Group>
              </Paper>
            ))}
          </Stack>

          {/* Desktop: data table */}
          <Paper withBorder visibleFrom="lg">
            <Table withRowBorders={false} highlightOnHover tabularNums>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Shortname</Table.Th>
                  <Table.Th>Phone</Table.Th>
                  <Table.Th>Role</Table.Th>
                  <Table.Th>Department</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th ta="right">
                    <VisuallyHidden>Actions</VisuallyHidden>
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filtered.map((user) => (
                  <Table.Tr
                    key={user.id}
                    onClick={() => openEdit(user)}
                    {...activatable(() => openEdit(user))}
                    style={{ cursor: "pointer" }}
                  >
                    <Table.Td>
                      <Stack gap={0}>
                        <Text fw={600}>{user.name}</Text>
                        <Text size="sm" c="dimmed">
                          {formatFullName(
                            { name: user.name, departmentName: user.department?.name ?? null },
                            nameTemplate,
                          )}
                        </Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      {user.shortname ? (
                        <Badge variant="light" color="accent">
                          {user.shortname}
                        </Badge>
                      ) : (
                        <Text c="dimmed">—</Text>
                      )}
                    </Table.Td>
                    <Table.Td>{user.phone}</Table.Td>
                    <Table.Td>
                  <Badge color={user.role === "admin" ? "brand" : "gray"}>
                    {user.role === "admin" ? "Admin" : "User"}
                  </Badge>
                    </Table.Td>
                    <Table.Td>
                      {user.department ? (
                        <Badge variant="light" color="accent">
                          {user.department.name}
                        </Badge>
                      ) : (
                        <Badge variant="outline" color="gray">
                          No department
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Badge color={user.status === "active" ? "green" : "gray"}>
                        {user.status === "active" ? "Active" : "Inactive"}
                      </Badge>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Button
                        size="xs"
                        variant="subtle"
                        onClick={(event) => {
                          event.stopPropagation();
                          openEdit(user);
                        }}
                      >
                        Edit
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
        </>
      )}

      <Modal
        opened={opened}
        onClose={close}
        title={editingUser ? "Edit user" : "Add user"}
        centered
        size={isDesktop ? "lg" : "md"}
      >
        <UserForm
          key={editingUser?.id ?? "new"}
          user={editingUser}
          departments={departments}
          access={editingUser ? (accessByUser[editingUser.id] ?? []) : []}
          onDone={() => {
            close();
            setEditingUser(null);
            refreshAfterSave();
          }}
        />
      </Modal>

      <FilterModal
        opened={filterOpened}
        onClose={closeFilter}
        title="Filters"
        groups={filterGroups}
        values={filterValues}
        onApply={handleApplyFilters}
        originRect={filterOriginRect}
      />

      {/* Mobile-only: at lg the "Add user" button in the toolbar replaces the
          FAB. hiddenFrom sits on the toolbar itself: its Affix portals to
          <body>, so a wrapper element could not hide it. */}
      <FloatingToolbar bottomOffset="var(--settings-fab-bottom)" hiddenFrom="lg">
        <FloatingActionButton aria-label="Add user" onClick={openCreate}>
          <IconPlus size={FAB_ICON_SIZE} />
        </FloatingActionButton>
      </FloatingToolbar>
    </Stack>
  );
}
