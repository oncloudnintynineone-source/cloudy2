"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
  useMantineTheme,
  VisuallyHidden,
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { IconPlus } from "@tabler/icons-react";

import { FilterButton } from "@/components/FilterButton";
import { FilterModal, type FilterGroup } from "@/components/FilterModal";
import { FAB_ICON_SIZE, FloatingActionButton, FloatingToolbar } from "@/components/FloatingToolbar";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import type { RosterUser } from "@/lib/roster/queries";
import { formatFullName } from "@/lib/settings/formatName";
import { UserForm, type DepartmentOption } from "./UserForm";

interface UserTableProps {
  users: RosterUser[];
  departments: DepartmentOption[];
  nameTemplate: string;
}

export function UserTable({ users, departments, nameTemplate }: UserTableProps) {
  const router = useRouter();
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const [opened, { open, close }] = useDisclosure(false);
  const [filterOpened, { open: openFilter, close: closeFilter }] = useDisclosure(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState<string[]>([]);
  const [editingUser, setEditingUser] = useState<RosterUser | null>(null);

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
        options: departments.map((d) => ({ value: d.id, label: d.name })),
      },
    ],
    [departments],
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
              placeholder="Search by name or phone"
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <FilterButton activeCount={activeFilterCount} onClick={openFilter} />
          </Group>
          {activeFilterCount > 0 ? (
            <Group gap={6} wrap="wrap">
              {statusFilter.map((value) => (
                <Badge key={value} color="brand" variant="light">
                  Status: {value === "active" ? "Active" : "Inactive"}
                </Badge>
              ))}
              {departmentFilter.map((value) => {
                const department = departments.find((d) => d.id === value);
                return (
                  <Badge key={value} color="brand" variant="light">
                    {department?.name ?? value}
                  </Badge>
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
        <Text c="dimmed" ta="center" py="lg">
          No users found.
        </Text>
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
                  <Badge color={user.status === "active" ? "teal" : "gray"}>{user.status}</Badge>
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
                  <Badge color={user.role === "admin" ? "brand" : "gray"}>{user.role}</Badge>
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
                  <Table.Th>Short Name</Table.Th>
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
                      <Badge color={user.role === "admin" ? "brand" : "gray"}>{user.role}</Badge>
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
                      <Badge color={user.status === "active" ? "teal" : "gray"}>
                        {user.status}
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
          onDone={() => {
            close();
            setEditingUser(null);
            router.refresh();
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
      />

      <FloatingToolbar bottomOffset="var(--settings-fab-bottom)">
        <FloatingActionButton aria-label="Add user" onClick={openCreate}>
          <IconPlus size={FAB_ICON_SIZE} />
        </FloatingActionButton>
      </FloatingToolbar>
    </Stack>
  );
}
