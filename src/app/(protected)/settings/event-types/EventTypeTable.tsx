"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Group, Modal, Paper, Stack, Text } from "@mantine/core";

import { useDisclosure } from "@mantine/hooks";

import type { EventType } from "@/db/schema";
import { FloatingActionButton, FloatingToolbar } from "@/components/FloatingToolbar";
import { SETTINGS_TAB_BAR_OFFSET } from "../settingsTabBar";
import { LOCATION_POLICY_LABELS, normalizeLocationPolicy } from "@/lib/events/locationPolicy";
import {
  TIME_OPTION_LABELS,
  normalizeTimeOptions,
  resolveTimeOptions,
} from "@/lib/events/timeOptions";
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
                <Group gap="xs" wrap="wrap">
                  {eventType.shortname ? (
                    <Badge size="sm" variant="light" color="accent">
                      {eventType.shortname}
                    </Badge>
                  ) : null}
                  {resolveTimeOptions(normalizeTimeOptions(eventType.timeOptions)).map((option) => (
                    <Badge key={option} size="sm" variant="light" color="gray">
                      {TIME_OPTION_LABELS[option]}
                    </Badge>
                  ))}
                  <Badge size="sm" variant="light" color="accent">
                    {LOCATION_POLICY_LABELS[normalizeLocationPolicy(eventType.locationPolicy)]}
                  </Badge>
                </Group>
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

      <FloatingToolbar bottomOffset={SETTINGS_TAB_BAR_OFFSET}>
        <FloatingActionButton onClick={openCreate}>Add event type</FloatingActionButton>
      </FloatingToolbar>
    </Stack>
  );
}
