"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, Paper, Stack, Text } from "@mantine/core";

import { useDisclosure } from "@mantine/hooks";

import type { EventType } from "@/db/schema";
import { FloatingToolbar } from "@/components/FloatingToolbar";
import { EventTypeForm } from "./EventTypeForm";

interface EventTypeTableProps {
  types: EventType[];
}

export function EventTypeTable({ types }: EventTypeTableProps) {
  const router = useRouter();
  const [formOpened, { open: openForm, close: closeForm }] = useDisclosure(false);
  const [editing, setEditing] = useState<EventType | null>(null);

  function openCreate() {
    setEditing(null);
    openForm();
  }

  function openEdit(eventType: EventType) {
    setEditing(eventType);
    openForm();
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
            <Paper
              key={eventType.id}
              withBorder
              p="sm"
              onClick={() => openEdit(eventType)}
              style={{ cursor: "pointer" }}
            >
              <Stack gap={0}>
                <Text fw={600}>{eventType.name}</Text>
                {eventType.shortname ? (
                  <Text size="sm" c="dimmed">
                    {eventType.shortname}
                  </Text>
                ) : null}
              </Stack>
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
