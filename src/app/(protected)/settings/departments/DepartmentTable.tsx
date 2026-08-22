"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Group, Modal, Paper, Stack, Table, Text, VisuallyHidden } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconPlus } from "@tabler/icons-react";

import type { Calendar } from "@/db/schema";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import { deleteDepartment } from "@/lib/roster/actions";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { FAB_ICON_SIZE, FloatingActionButton, FloatingToolbar } from "@/components/FloatingToolbar";
import { DepartmentForm } from "./DepartmentForm";
import { DepartmentShares } from "./DepartmentShares";

interface DepartmentTableProps {
  departments: Calendar[];
}

export function DepartmentTable({ departments }: DepartmentTableProps) {
  const router = useRouter();
  const [formOpened, { open: openForm, close: closeForm }] = useDisclosure(false);
  const [confirmOpened, { open: openConfirm, close: closeConfirm }] = useDisclosure(false);
  const [shareOpened, { open: openShare, close: closeShare }] = useDisclosure(false);
  const [editing, setEditing] = useState<Calendar | null>(null);
  const [deleting, setDeleting] = useState<Calendar | null>(null);
  const [deletingInProgress, setDeletingInProgress] = useState(false);
  const [sharing, setSharing] = useState<Calendar | null>(null);

  function openCreate() {
    setEditing(null);
    openForm();
  }

  function openEdit(calendar: Calendar) {
    setEditing(calendar);
    openForm();
  }

  function openShareModal(calendar: Calendar) {
    setSharing(calendar);
    openShare();
  }

  async function confirmDelete() {
    if (!deleting || deletingInProgress) {
      return;
    }
    setDeletingInProgress(true);
    try {
      const result = await deleteDepartment(deleting.id);
      if (result.ok) {
        notifications.show({ color: "green", message: "Department deleted" });
        closeConfirm();
        setDeleting(null);
        router.refresh();
      } else {
        notifications.show({ color: "red", message: result.error });
      }
    } finally {
      setDeletingInProgress(false);
    }
  }

  return (
    <Stack pb="xl" className={CONTENT_ENTER_CLASS}>
      {departments.length === 0 ? (
        <Text c="dimmed" ta="center" py="lg">
          No departments yet.
        </Text>
      ) : (
        <>
          {/* Mobile: card list */}
          <Stack gap="sm" hiddenFrom="lg">
            {departments.map((calendar) => (
              <Paper key={calendar.id} withBorder p="sm">
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Text fw={600}>{calendar.name}</Text>
                  <Button size="xs" variant="light" onClick={() => openShareModal(calendar)}>
                    Share
                  </Button>
                </Group>
                <Text size="sm" c="dimmed" mt={4} style={{ wordBreak: "break-all" }}>
                  {calendar.googleCalendarId}
                </Text>
                <Group justify="flex-end" mt="sm" wrap="nowrap">
                  <Button size="xs" variant="light" onClick={() => openEdit(calendar)}>
                    Rename
                  </Button>
                  <Button
                    size="xs"
                    variant="subtle"
                    color="red"
                    onClick={() => {
                      setDeleting(calendar);
                      openConfirm();
                    }}
                  >
                    Delete
                  </Button>
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
                  <Table.Th>Calendar ID</Table.Th>
                  <Table.Th ta="right">
                    <VisuallyHidden>Actions</VisuallyHidden>
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {departments.map((calendar) => (
                  <Table.Tr key={calendar.id}>
                    <Table.Td>
                      <Text fw={600}>{calendar.name}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed" style={{ wordBreak: "break-all" }}>
                        {calendar.googleCalendarId}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs" justify="flex-end" wrap="nowrap">
                        <Button size="xs" variant="light" onClick={() => openShareModal(calendar)}>
                          Share
                        </Button>
                        <Button size="xs" variant="light" onClick={() => openEdit(calendar)}>
                          Rename
                        </Button>
                        <Button
                          size="xs"
                          variant="subtle"
                          color="red"
                          onClick={() => {
                            setDeleting(calendar);
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
          </Paper>
        </>
      )}

      <Modal
        opened={formOpened}
        onClose={closeForm}
        title={editing ? "Rename department" : "Add department"}
        centered
        size="sm"
      >
        <DepartmentForm
          key={editing?.id ?? "new"}
          calendar={editing}
          onDone={() => {
            closeForm();
            setEditing(null);
            router.refresh();
          }}
        />
      </Modal>

      <Modal opened={confirmOpened} onClose={closeConfirm} title="Delete department" centered>
        <Text>
          Delete &quot;{deleting?.name}&quot;? This removes the Google Calendar and unassigns its
          users.
        </Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={closeConfirm}>
            Cancel
          </Button>
          <Button
            color="red"
            loading={deletingInProgress}
            loaderProps={BUTTON_LOADER_PROPS}
            onClick={confirmDelete}
          >
            Delete
          </Button>
        </Group>
      </Modal>

      <DepartmentShares calendar={sharing} opened={shareOpened} onClose={closeShare} />

      <FloatingToolbar bottomOffset="var(--settings-fab-bottom)">
        <FloatingActionButton aria-label="Add department" onClick={openCreate}>
          <IconPlus size={FAB_ICON_SIZE} />
        </FloatingActionButton>
      </FloatingToolbar>
    </Stack>
  );
}
