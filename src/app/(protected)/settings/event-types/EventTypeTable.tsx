"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Stack,
  Table,
  Text,
  useMantineTheme,
} from "@mantine/core";

import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { IconCalendarEvent, IconCategory2, IconFolder, IconPlus } from "@tabler/icons-react";

import { EmptyState } from "@/components/EmptyState";
import type { EventType } from "@/db/schema";
import { FAB_ICON_SIZE, FloatingActionButton, FloatingToolbar } from "@/components/FloatingToolbar";
import { formatColorLabel } from "@/lib/events/eventColors";
import { ColorDot } from "@/components/ColorSwatchPicker";
import { LOCATION_CATEGORY_LABELS, normalizeAllowedLocations } from "@/lib/events/locationPolicy";
import {
  TIME_OPTION_LABELS,
  normalizeTimeOptions,
  resolveTimeOptions,
} from "@/lib/events/timeOptions";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import { activatable } from "@/lib/ui/activatable";
import dynamic from "next/dynamic";
import { FormModalSkeleton } from "@/components/FormModalSkeleton";
import { EventTypeGroupsModal } from "./EventTypeGroupsModal";
import { useActivityRefresh } from "@/components/ActivityBar";

// The add/edit event-type form is only mounted on tap; split it out of the
// event-types route's initial chunk.
const EventTypeForm = dynamic(() => import("./EventTypeForm").then((mod) => mod.EventTypeForm), {
  ssr: false,
  loading: () => <FormModalSkeleton rows={5} />,
});

interface EventTypeTableProps {
  types: EventType[];
  groups: { id: string; name: string; sortOrder: number; collapsible: boolean }[];
  dragEnabled: boolean;
}

export function EventTypeTable({ types, groups, dragEnabled }: EventTypeTableProps) {
  const refreshAfterSave = useActivityRefresh("event-types:save");
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const [formOpened, { open: openForm, close: closeForm }] = useDisclosure(false);
  const [editing, setEditing] = useState<EventType | null>(null);
  const [groupsOpened, { open: openGroups, close: closeGroups }] = useDisclosure(false);

  const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);

  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const eventType of types) {
      if (eventType.groupId) {
        counts.set(eventType.groupId, (counts.get(eventType.groupId) ?? 0) + 1);
      }
    }
    return counts;
  }, [types]);

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
      {/* Desktop: full-size create button instead of the FAB (like the
          Calendar page's "New event" button); the FAB below is mobile-only.
          Rendered above the list so it is still available when empty. */}
      <Paper withBorder p="sm" visibleFrom="lg">
        <Group justify="space-between" wrap="nowrap">
          <Button
            __vars={{ "--button-height": "43px" }}
            variant="default"
            leftSection={<IconCategory2 size={16} />}
            onClick={openGroups}
          >
            Manage groups
          </Button>
          <Button
            __vars={{ "--button-height": "43px" }}
            leftSection={<IconPlus size={16} />}
            onClick={openCreate}
          >
            Add event type
          </Button>
        </Group>
      </Paper>

      {types.length === 0 ? (
        <EmptyState
          icon={<IconCalendarEvent size={18} />}
          description="No event types yet. Create one to define its shortname, time options, allowed locations and visibility."
          actionLabel="Add event type"
          onAction={openCreate}
        />
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
                {...activatable(() => openEdit(eventType))}
                style={{ cursor: "pointer" }}
              >
                <Stack gap={0}>
                  <Group wrap="nowrap" align="center" gap={6}>
                    <ColorDot color={eventType.color} />
                    <Text fw={600}>{eventType.name}</Text>
                  </Group>
                  <Group gap="xs" wrap="wrap">
                    {eventType.groupId && groupById.has(eventType.groupId) ? (
                      <Badge
                        size="sm"
                        variant="light"
                        color="blue"
                        leftSection={
                          groupById.get(eventType.groupId)?.collapsible ? (
                            <IconFolder size={12} />
                          ) : undefined
                        }
                      >
                        {groupById.get(eventType.groupId)?.name}
                      </Badge>
                    ) : null}
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
                    {normalizeAllowedLocations(eventType.allowedLocations).map((category) => (
                      <Badge key={category} size="sm" variant="light" color="accent">
                        {LOCATION_CATEGORY_LABELS[category]}
                      </Badge>
                    ))}
                    {eventType.showRemarks === false && (
                      <Badge size="sm" variant="light" color="gray">
                        No remarks
                      </Badge>
                    )}
                    {eventType.showInvitees === false && (
                      <Badge size="sm" variant="light" color="gray">
                        No participants
                      </Badge>
                    )}
                    {eventType.showLocation === false && (
                      <Badge size="sm" variant="light" color="gray">
                        No location
                      </Badge>
                    )}
                    {eventType.excludeFromClash === true && (
                      <Badge size="sm" variant="light" color="red">
                        Info only
                      </Badge>
                    )}
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
                  <Table.Th>Group</Table.Th>
                  <Table.Th>Shortname</Table.Th>
                  <Table.Th>Color</Table.Th>
                  <Table.Th>Time options</Table.Th>
                  <Table.Th>Allowed locations</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {types.map((eventType) => (
                  <Table.Tr
                    key={eventType.id}
                    onClick={() => openEdit(eventType)}
                    {...activatable(() => openEdit(eventType))}
                    style={{ cursor: "pointer" }}
                  >
                    <Table.Td>
                      <Text fw={600}>{eventType.name}</Text>
                    </Table.Td>
                    <Table.Td>
                      {eventType.groupId && groupById.has(eventType.groupId) ? (
                        <Badge
                          size="sm"
                          variant="light"
                          color="blue"
                          leftSection={
                            groupById.get(eventType.groupId)?.collapsible ? (
                              <IconFolder size={12} />
                            ) : undefined
                          }
                        >
                          {groupById.get(eventType.groupId)?.name}
                        </Badge>
                      ) : (
                        <Text c="dimmed">—</Text>
                      )}
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
                      <Group gap={6} wrap="nowrap">
                        <ColorDot color={eventType.color} />
                        <Text size="sm">{formatColorLabel(eventType.color, eventType.name)}</Text>
                      </Group>
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
                      <Group gap="xs" wrap="wrap">
                        {normalizeAllowedLocations(eventType.allowedLocations).map((category) => (
                          <Badge key={category} size="sm" variant="light" color="accent">
                            {LOCATION_CATEGORY_LABELS[category]}
                          </Badge>
                        ))}
                        {eventType.showRemarks === false && (
                          <Badge size="sm" variant="light" color="gray">
                            No remarks
                          </Badge>
                        )}
                        {eventType.showInvitees === false && (
                          <Badge size="sm" variant="light" color="gray">
                            No participants
                          </Badge>
                        )}
                        {eventType.showLocation === false && (
                          <Badge size="sm" variant="light" color="gray">
                            No location
                          </Badge>
                        )}
                        {eventType.excludeFromClash === true && (
                          <Badge size="sm" variant="light" color="red">
                            Info only
                          </Badge>
                        )}
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
        title={editing ? "Edit event type" : "Add event type"}
        centered
        size={isDesktop ? "lg" : "sm"}
      >
        <EventTypeForm
          key={editing?.id ?? "new"}
          eventType={editing}
          groups={groups}
          onDone={() => {
            closeForm();
            setEditing(null);
            refreshAfterSave();
          }}
        />
      </Modal>

      <EventTypeGroupsModal
        opened={groupsOpened}
        onClose={closeGroups}
        groups={groups}
        typeCounts={typeCounts}
        dragEnabled={dragEnabled}
        onMutated={() => {
          refreshAfterSave();
        }}
      />

      {/* Mobile-only: at lg the "Add event type" button in the toolbar replaces
          the FAB. hiddenFrom sits on the toolbar itself: its Affix portals to
          <body>, so a wrapper element could not hide it. */}
      <FloatingToolbar bottomOffset="var(--settings-fab-bottom)" hiddenFrom="lg">
        <FloatingActionButton aria-label="Manage event type groups" onClick={openGroups}>
          <IconCategory2 size={FAB_ICON_SIZE} />
        </FloatingActionButton>
        <FloatingActionButton aria-label="Add event type" onClick={openCreate}>
          <IconPlus size={FAB_ICON_SIZE} />
        </FloatingActionButton>
      </FloatingToolbar>
    </Stack>
  );
}
