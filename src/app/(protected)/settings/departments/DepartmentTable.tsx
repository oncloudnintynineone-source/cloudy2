"use client";

import { type KeyboardEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Group, Modal, Paper, Stack, Table, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconPlus } from "@tabler/icons-react";

import type { Calendar } from "@/db/schema";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import { deleteDepartment } from "@/lib/roster/actions";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { FAB_ICON_SIZE, FloatingActionButton, FloatingToolbar } from "@/components/FloatingToolbar";
import { formatColorLabel } from "@/lib/events/eventColors";
import { ColorDot } from "@/components/ColorSwatchPicker";
import { DepartmentDetail } from "./DepartmentDetail";

interface DepartmentTableProps {
  departments: Calendar[];
}

export function DepartmentTable({ departments }: DepartmentTableProps) {
  const router = useRouter();
  const [detailOpened, { open: openDetail, close: closeDetail }] = useDisclosure(false);
  const [confirmOpened, { open: openConfirm, close: closeConfirm }] = useDisclosure(false);
  const [selected, setSelected] = useState<Calendar | null>(null);
  const [deleting, setDeleting] = useState<Calendar | null>(null);
  const [deletingInProgress, setDeletingInProgress] = useState(false);

  function openCreate() {
    setSelected(null);
    openDetail();
  }

  function openDetails(calendar: Calendar) {
    setSelected(calendar);
    openDetail();
  }

  function requestDelete(calendar: Calendar) {
    setDeleting(calendar);
    closeDetail();
    openConfirm();
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

  const openRow = (calendar: Calendar) => ({
    role: "button",
    tabIndex: 0,
    "aria-haspopup": "dialog" as const,
    "aria-label": `Open ${calendar.name} details`,
    onClick: () => openDetails(calendar),
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openDetails(calendar);
      }
    },
    style: { cursor: "pointer" },
  });

  return (
    <Stack pb="xl" className={CONTENT_ENTER_CLASS}>
      {/* Desktop: full-size create button instead of the FAB (like the
          Calendar page's "New event" button); the FAB below is mobile-only.
          Rendered above the list so it is still available when empty. */}
      <Paper withBorder p="sm" visibleFrom="lg">
        <Group justify="flex-end" wrap="nowrap">
          <Button
            __vars={{ "--button-height": "43px" }}
            leftSection={<IconPlus size={16} />}
            onClick={openCreate}
          >
            Add department
          </Button>
        </Group>
      </Paper>

      {departments.length === 0 ? (
        <Group justify="center" wrap="nowrap" py="lg">
          <Text c="dimmed">No departments yet.</Text>
          <Button variant="light" leftSection={<IconPlus size={16} />} onClick={openCreate}>
            Add department
          </Button>
        </Group>
      ) : (
        <>
          {/* Mobile: card list — tap a card to open the details modal */}
          <Stack gap="sm" hiddenFrom="lg">
            {departments.map((calendar) => (
              <Paper key={calendar.id} withBorder p="sm" {...openRow(calendar)}>
                <Group justify="space-between" wrap="nowrap" align="center">
                  <Group wrap="nowrap" align="center" gap={6}>
                    <ColorDot color={calendar.color} />
                    <Text fw={600}>{calendar.name}</Text>
                  </Group>
                  <Text size="sm" c="dimmed">
                    {formatColorLabel(calendar.color, calendar.id)}
                  </Text>
                </Group>
              </Paper>
            ))}
          </Stack>

          {/* Desktop: data table — tap a row to open the details modal */}
          <Paper withBorder visibleFrom="lg">
            <Table withRowBorders={false} highlightOnHover tabularNums>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>External color</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {departments.map((calendar) => (
                  <Table.Tr key={calendar.id} {...openRow(calendar)}>
                    <Table.Td>
                      <Text fw={600}>{calendar.name}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={6} wrap="nowrap">
                        <ColorDot color={calendar.color} />
                        <Text size="sm">{formatColorLabel(calendar.color, calendar.id)}</Text>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
        </>
      )}

      <DepartmentDetail
        calendar={selected}
        opened={detailOpened}
        onClose={closeDetail}
        onSaved={(calendar) => {
          setSelected(calendar);
        }}
        onCreate={() => {
          closeDetail();
          setSelected(null);
          router.refresh();
        }}
        onRequestDelete={requestDelete}
      />

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

      {/* Mobile-only: at lg the "Add department" button in the toolbar replaces
          the FAB. hiddenFrom sits on the toolbar itself: its Affix portals to
          <body>, so a wrapper element could not hide it. */}
      <FloatingToolbar bottomOffset="var(--settings-fab-bottom)" hiddenFrom="lg">
        <FloatingActionButton aria-label="Add department" onClick={openCreate}>
          <IconPlus size={FAB_ICON_SIZE} />
        </FloatingActionButton>
      </FloatingToolbar>
    </Stack>
  );
}
