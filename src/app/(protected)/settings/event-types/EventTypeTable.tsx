"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Group, Modal, Paper, Stack, Text } from "@mantine/core";

import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";

import type { EventType } from "@/db/schema";
import { deleteEventType } from "@/lib/eventTypes/actions";
import { FloatingToolbar } from "@/components/FloatingToolbar";
import { EventTypeForm } from "./EventTypeForm";

interface EventTypeTableProps {
  types: EventType[];
}

export function EventTypeTable({ types }: EventTypeTableProps) {
  const router = useRouter();
  const [formOpened, { open: openForm, close: closeForm }] = useDisclosure(false);
  const [confirmOpened, { open: openConfirm, close: closeConfirm }] = useDisclosure(false);
  const [editing, setEditing] = useState<EventType | null>(null);
  const [deleting, setDeleting] = useState<EventType | null>(null);

  function openCreate() {
    setEditing(null);
    openForm();
  }

  function openEdit(eventType: EventType) {
    setEditing(eventType);
    openForm();
  }

  async function confirmDelete() {
    if (!deleting) {
      return;
    }
    const result = await deleteEventType(deleting.id);
    if (result.ok) {
      notifications.show({ color: "green", message: "Event type deleted" });
      closeConfirm();
      setDeleting(null);
      router.refresh();
    } else {
      notifications.show({ color: "red", message: result.error });
    }
  }

  return (
    <Stack pb="xl">
      {types.length === 0 ? (
        <Text c="dimmed" ta="center" py="lg">
          No event types yet.
        </Text>
      ) : (
        <Stack gap="sm">
          {types.map((eventType) => (
            <Paper key={eventType.id} withBorder p="sm">
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Stack gap={0}>
                  <Text fw={600}>{eventType.name}</Text>
                  {eventType.shortname ? (
                    <Text size="sm" c="dimmed">
                      {eventType.shortname}
                    </Text>
                  ) : null}
                </Stack>
              </Group>
              <Group justify="flex-end" mt="sm" wrap="nowrap">
                <Button size="xs" variant="light" onClick={() => openEdit(eventType)}>
                  Rename
                </Button>
                <Button
                  size="xs"
                  variant="subtle"
                  color="red"
                  onClick={() => {
                    setDeleting(eventType);
                    openConfirm();
                  }}
                >
                  Delete
                </Button>
              </Group>
            </Paper>
          ))}
        </Stack>
      )}

      <Modal
        opened={formOpened}
        onClose={closeForm}
        title={editing ? "Edit event type" : "Add event type"}
        centered
        size="sm"
      >
        <EventTypeForm
          key={editing?.id ?? "new"}
          eventType={editing}
          onDone={() => {
            closeForm();
            setEditing(null);
            router.refresh();
          }}
        />
      </Modal>

      <Modal opened={confirmOpened} onClose={closeConfirm} title="Delete event type" centered>
        <Text>Delete &quot;{deleting?.name}&quot;?</Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={closeConfirm}>
            Cancel
          </Button>
          <Button color="red" onClick={confirmDelete}>
            Delete
          </Button>
        </Group>
      </Modal>

      <FloatingToolbar>
        <Button
          radius="xl"
          style={{ boxShadow: "var(--mantine-shadow-md)" }}
          onClick={openCreate}
        >
          Add event type
        </Button>
      </FloatingToolbar>
    </Stack>
  );
}
