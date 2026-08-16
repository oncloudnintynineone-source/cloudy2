"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Group,
  Modal,
  Paper,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";

import { deleteDepartment } from "@/lib/roster/actions";
import type { Department } from "@/db/schema";
import { DepartmentForm } from "./DepartmentForm";

interface DepartmentTableProps {
  departments: Department[];
}

export function DepartmentTable({ departments }: DepartmentTableProps) {
  const router = useRouter();
  const [formOpened, { open: openForm, close: closeForm }] = useDisclosure(false);
  const [confirmOpened, { open: openConfirm, close: closeConfirm }] = useDisclosure(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [deleting, setDeleting] = useState<Department | null>(null);

  function openCreate() {
    setEditing(null);
    openForm();
  }

  function openEdit(department: Department) {
    setEditing(department);
    openForm();
  }

  async function confirmDelete() {
    if (!deleting) {
      return;
    }
    const result = await deleteDepartment(deleting.id);
    if (result.ok) {
      notifications.show({ color: "green", message: "Department deleted" });
      closeConfirm();
      setDeleting(null);
      router.refresh();
    } else {
      notifications.show({ color: "red", message: result.error });
    }
  }

  return (
    <Stack>
      <Group justify="space-between" wrap="wrap">
        <Title order={2}>Departments</Title>
        <Button onClick={openCreate}>Add department</Button>
      </Group>

      <Paper withBorder p="md">
        {departments.length === 0 ? (
          <Text c="dimmed" ta="center" py="lg">
            No departments yet.
          </Text>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Sort order</Table.Th>
                <Table.Th ta="right">Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {departments.map((department) => (
                <Table.Tr key={department.id}>
                  <Table.Td>{department.name}</Table.Td>
                  <Table.Td>{department.sortOrder}</Table.Td>
                  <Table.Td>
                    <Group gap={4} justify="flex-end">
                      <Button size="xs" variant="light" onClick={() => openEdit(department)}>
                        Edit
                      </Button>
                      <Button
                        size="xs"
                        variant="subtle"
                        color="red"
                        onClick={() => {
                          setDeleting(department);
                          openConfirm();
                        }}
                      >
                        Delete
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>

      <Modal opened={formOpened} onClose={closeForm} title={editing ? "Edit department" : "Add department"} size="sm">
        <DepartmentForm
          key={editing?.id ?? "new"}
          department={editing}
          onDone={() => {
            closeForm();
            setEditing(null);
            router.refresh();
          }}
        />
      </Modal>

      <Modal
        opened={confirmOpened}
        onClose={closeConfirm}
        title="Delete department"
        size="sm"
      >
        <Text>
          Delete &quot;{deleting?.name}&quot;? This also removes all user memberships and
          calendar links for this department.
        </Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={closeConfirm}>
            Cancel
          </Button>
          <Button color="red" onClick={confirmDelete}>
            Delete
          </Button>
        </Group>
      </Modal>
    </Stack>
  );
}
