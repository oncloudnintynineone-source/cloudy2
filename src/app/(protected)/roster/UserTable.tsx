"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";

import { setUserStatus } from "@/lib/roster/actions";
import type { RosterUser } from "@/lib/roster/queries";
import { UserForm, type DepartmentOption } from "./UserForm";

interface UserTableProps {
  users: RosterUser[];
  departments: DepartmentOption[];
}

type StatusFilter = "all" | "active" | "inactive";

export function UserTable({ users, departments }: UserTableProps) {
  const router = useRouter();
  const [opened, { open, close }] = useDisclosure(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [editingUser, setEditingUser] = useState<RosterUser | null>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((user) => {
      if (statusFilter !== "all" && user.status !== statusFilter) {
        return false;
      }
      if (departmentFilter !== "all" && user.department?.id !== departmentFilter) {
        return false;
      }
      if (query && !user.name.toLowerCase().includes(query) && !user.phone.includes(query)) {
        return false;
      }
      return true;
    });
  }, [users, search, statusFilter, departmentFilter]);

  async function handleToggleStatus(user: RosterUser) {
    const next = user.status === "active" ? "inactive" : "active";
    const result = await setUserStatus(user.id, next);
    if (result.ok) {
      notifications.show({
        color: "green",
        message: next === "active" ? "User activated" : "User deactivated",
      });
      router.refresh();
    } else {
      notifications.show({ color: "red", message: result.error });
    }
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
    <Stack>
      <Group justify="space-between" wrap="wrap">
        <Title order={2}>Roster</Title>
        <Button onClick={openCreate}>Add user</Button>
      </Group>

      <Paper withBorder p="sm">
        <Group grow gap="sm">
          <TextInput
            placeholder="Search by name or phone"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />
          <Select
            data={[
              { value: "all", label: "All statuses" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
            value={statusFilter}
            onChange={(value) => setStatusFilter((value as StatusFilter) ?? "all")}
          />
          <Select
            data={[
              { value: "all", label: "All departments" },
              ...departments.map((d) => ({ value: d.id, label: d.name })),
            ]}
            value={departmentFilter}
            onChange={(value) => setDepartmentFilter(value ?? "all")}
            searchable
          />
        </Group>
      </Paper>

      <Paper withBorder p="md">
        {filtered.length === 0 ? (
          <Text c="dimmed" ta="center" py="lg">
            No users found.
          </Text>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Phone</Table.Th>
                <Table.Th>Email</Table.Th>
                <Table.Th>Birthday</Table.Th>
                <Table.Th>Role</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Department</Table.Th>
                <Table.Th ta="right">Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((user) => (
                <Table.Tr key={user.id}>
                  <Table.Td>{user.name}</Table.Td>
                  <Table.Td>{user.phone}</Table.Td>
                  <Table.Td>{user.email ?? "—"}</Table.Td>
                  <Table.Td>{user.birthday ?? "—"}</Table.Td>
                  <Table.Td>
                    <Badge color={user.role === "admin" ? "red" : "blue"}>{user.role}</Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={user.status === "active" ? "teal" : "gray"}>
                      {user.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {user.department ? (
                      <Badge variant="light">{user.department.name}</Badge>
                    ) : (
                      <Text c="dimmed" size="sm">
                        —
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} justify="flex-end">
                      <Button size="xs" variant="light" onClick={() => openEdit(user)}>
                        Edit
                      </Button>
                      <Button
                        size="xs"
                        variant={user.status === "active" ? "subtle" : "light"}
                        color={user.status === "active" ? "gray" : "teal"}
                        onClick={() => handleToggleStatus(user)}
                      >
                        {user.status === "active" ? "Deactivate" : "Activate"}
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>

      <Modal
        opened={opened}
        onClose={close}
        title={editingUser ? "Edit user" : "Add user"}
        size="md"
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
    </Stack>
  );
}
