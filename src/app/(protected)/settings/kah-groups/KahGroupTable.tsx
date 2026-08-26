"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { IconPlus } from "@tabler/icons-react";

import type { KahGroupWithMembers } from "@/lib/kah/queries";
import { FAB_ICON_SIZE, FloatingActionButton, FloatingToolbar } from "@/components/FloatingToolbar";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import type { UserGroupInput } from "@/lib/users/userSelect";
import { activatable } from "@/lib/ui/activatable";

import { KahGroupForm } from "./KahGroupForm";

interface KahGroupTableProps {
  groups: KahGroupWithMembers[];
  pickerUsers: UserGroupInput[];
  /** Settings default prefilled when creating a new group. */
  defaultPercentage: number;
}

export function KahGroupTable({ groups, pickerUsers, defaultPercentage }: KahGroupTableProps) {
  const router = useRouter();
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const [formOpened, { open: openForm, close: closeForm }] = useDisclosure(false);
  const [editing, setEditing] = useState<KahGroupWithMembers | null>(null);

  function openCreate() {
    setEditing(null);
    openForm();
  }

  function openEdit(group: KahGroupWithMembers) {
    setEditing(group);
    openForm();
  }

  return (
    <Stack pb="xl" gap="sm" className={CONTENT_ENTER_CLASS}>
      {/* Desktop: full-size create button instead of the FAB (like the
          webhooks tab); rendered above the list so it is still available
          when empty. */}
      <Paper withBorder p="sm" visibleFrom="lg">
        <Group justify="flex-end" wrap="nowrap">
          <Button
            __vars={{ "--button-height": "43px" }}
            leftSection={<IconPlus size={16} />}
            onClick={openCreate}
          >
            Add group
          </Button>
        </Group>
      </Paper>

      {groups.length === 0 ? (
        <Text c="dimmed" ta="center" py="lg">
          No KAH groups yet. When an event pushes a group below its required in-country
          percentage, the notification addresses in Settings → General are emailed.
        </Text>
      ) : (
        <>
          {/* Mobile: card list */}
          <Stack gap="sm" hiddenFrom="lg">
            {groups.map((group) => (
              <Paper
                key={group.id}
                withBorder
                p="sm"
                onClick={() => openEdit(group)}
                {...activatable(() => openEdit(group))}
                style={{ cursor: "pointer" }}
              >
                <Stack gap={4}>
                  <Group justify="space-between" wrap="nowrap">
                    <Text fw={600}>{group.name}</Text>
                    <Badge size="sm" variant="light" color="blue">
                      {group.minPercentage}% in country
                    </Badge>
                  </Group>
                  <Text fz="sm" c="dimmed" lineClamp={2}>
                    {group.members.length > 0
                      ? group.members.map((member) => member.name).join(", ")
                      : "No members"}
                  </Text>
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
                  <Table.Th>Required in country</Table.Th>
                  <Table.Th>Members</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {groups.map((group) => (
                  <Table.Tr
                    key={group.id}
                    onClick={() => openEdit(group)}
                    {...activatable(() => openEdit(group))}
                    style={{ cursor: "pointer" }}
                  >
                    <Table.Td>
                      <Text fw={600}>{group.name}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge size="sm" variant="light" color="blue">
                        {group.minPercentage}%
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text fz="sm" c={group.members.length > 0 ? undefined : "dimmed"}>
                        {group.members.length > 0
                          ? `${group.members.length}: ${group.members
                              .map((member) => member.name)
                              .join(", ")}`
                          : "No members"}
                      </Text>
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
        title={editing ? "Edit KAH group" : "Add KAH group"}
        centered
        size={isDesktop ? "md" : "sm"}
      >
        <KahGroupForm
          key={editing?.id ?? "new"}
          group={
            editing
              ? {
                  id: editing.id,
                  name: editing.name,
                  minPercentage: editing.minPercentage,
                  memberIds: editing.members.map((member) => member.id),
                }
              : null
          }
          defaultPercentage={defaultPercentage}
          pickerUsers={pickerUsers}
          onDone={() => {
            closeForm();
            setEditing(null);
            router.refresh();
          }}
        />
      </Modal>

      {/* Mobile-only: at lg the "Add group" button in the toolbar replaces
          the FAB. hiddenFrom sits on the toolbar itself: its Affix portals to
          <body>, so a wrapper element could not hide it. */}
      <FloatingToolbar bottomOffset="var(--settings-fab-bottom)" hiddenFrom="lg">
        <FloatingActionButton aria-label="Add KAH group" onClick={openCreate}>
          <IconPlus size={FAB_ICON_SIZE} />
        </FloatingActionButton>
      </FloatingToolbar>
    </Stack>
  );
}
