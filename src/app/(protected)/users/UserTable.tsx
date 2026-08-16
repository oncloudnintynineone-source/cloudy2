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
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";

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
        <Title order={2}>Users</Title>
        <Button onClick={openCreate}>Add user</Button>
      </Group>

      <Paper withBorder p="sm">
        <Stack gap="xs">
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
        </Stack>
      </Paper>

      {filtered.length === 0 ? (
        <Text c="dimmed" ta="center" py="lg">
          No users found.
        </Text>
      ) : (
        <Stack gap="sm">
          {filtered.map((user) => (
            <Paper
              key={user.id}
              withBorder
              p="sm"
              onClick={() => openEdit(user)}
              style={{ cursor: "pointer" }}
            >
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Text fw={600}>{user.name}</Text>
                <Badge color={user.status === "active" ? "teal" : "gray"}>{user.status}</Badge>
              </Group>
              <Group gap={6} wrap="wrap" mt={4}>
                <Text size="sm" c="dimmed">
                  {user.phone}
                </Text>
                <Badge color={user.role === "admin" ? "red" : "blue"}>{user.role}</Badge>
                {user.department ? (
                  <Badge variant="light">{user.department.name}</Badge>
                ) : (
                  <Badge variant="outline" color="gray">
                    No department
                  </Badge>
                )}
              </Group>
            </Paper>
          ))}
        </Stack>
      )}

      <Modal
        opened={opened}
        onClose={close}
        title={editingUser ? "Edit user" : "Add user"}
        centered
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
