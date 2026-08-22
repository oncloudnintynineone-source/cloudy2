"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Group, Modal, Paper, Stack, Table, Text, useMantineTheme } from "@mantine/core";

import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { IconPlus } from "@tabler/icons-react";

import type { EventType } from "@/db/schema";
import { FAB_ICON_SIZE, FloatingActionButton, FloatingToolbar } from "@/components/FloatingToolbar";
import { LOCATION_POLICY_LABELS, normalizeLocationPolicy } from "@/lib/events/locationPolicy";
import {
  TIME_OPTION_LABELS,
  normalizeTimeOptions,
  resolveTimeOptions,
} from "@/lib/events/timeOptions";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import { EventTypeForm } from "./EventTypeForm";

interface EventTypeTableProps {
  types: EventType[];
}

export function EventTypeTable({ types }: EventTypeTableProps) {
  const router = useRouter();
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
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
    <Stack pb="xl" className={CONTENT_ENTER_CLASS}>
      {types.length === 0 ? (
        <Text c="dimmed" ta="center" py="lg">
          No event types yet.
        </Text>
      ) : (
        <>
          {/* Mobile: card list */}
          <Stack gap="sm" hiddenFrom="lg">
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
                    {resolveTimeOptions(normalizeTimeOptions(eventType.timeOptions)).map(
                      (option) => (
                        <Badge key={option} size="sm" variant="light" color="gray">
                          {TIME_OPTION_LABELS[option]}
                        </Badge>
                      ),
                    )}
                    <Badge size="sm" variant="light" color="accent">
                      {LOCATION_POLICY_LABELS[normalizeLocationPolicy(eventType.locationPolicy)]}
                    </Badge>
                  </Group>
                </Stack>
              </Paper>
            ))}
          </Stack>

          {/* Desktop: data table */}
          <Paper withBorder visibleFrom="lg">
            <Table withRowBorders={false} highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Acronym</Table.Th>
                  <Table.Th>Time options</Table.Th>
                  <Table.Th>Location policy</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {types.map((eventType) => (
                  <Table.Tr
                    key={eventType.id}
                    onClick={() => openEdit(eventType)}
                    style={{ cursor: "pointer" }}
                  >
                    <Table.Td>
                      <Text fw={600}>{eventType.name}</Text>
                    </Table.Td>
                    <Table.Td>
                      {eventType.shortname ? (
                        <Badge size="sm" variant="light" color="accent">
                          {eventType.shortname}
                        </Badge>
                      ) : (
                        <Text c="dimmed">—</Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs" wrap="wrap">
                        {resolveTimeOptions(normalizeTimeOptions(eventType.timeOptions)).map(
                          (option) => (
                            <Badge key={option} size="sm" variant="light" color="gray">
                              {TIME_OPTION_LABELS[option]}
                            </Badge>
                          ),
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Badge size="sm" variant="light" color="accent">
                        {LOCATION_POLICY_LABELS[normalizeLocationPolicy(eventType.locationPolicy)]}
                      </Badge>
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
        title={editing ? "Edit event type" : "Add event type"}
        centered
        size={isDesktop ? "md" : "sm"}
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

      <FloatingToolbar bottomOffset="var(--settings-fab-bottom)">
        <FloatingActionButton aria-label="Add event type" onClick={openCreate}>
          <IconPlus size={FAB_ICON_SIZE} />
        </FloatingActionButton>
      </FloatingToolbar>
    </Stack>
  );
}
