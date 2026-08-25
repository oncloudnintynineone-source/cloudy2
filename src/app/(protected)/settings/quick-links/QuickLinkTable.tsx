"use client";

import { useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Code,
  Group,
  Modal,
  Paper,
  Stack,
  Table,
  Text,
  Tooltip,
  useMantineTheme,
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { useRouter } from "next/navigation";
import { IconChevronDown, IconChevronUp, IconPlus, IconTrash } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";

import type { QuickLink } from "@/db/schema";
import {
  FAB_ICON_SIZE,
  FloatingActionButton,
  FloatingToolbar,
} from "@/components/FloatingToolbar";
import { QuickLinkIcon } from "@/components/QuickLinkIcon";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import { deleteQuickLink, moveQuickLink } from "@/lib/quickLinks/actions";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { activatable } from "@/lib/ui/activatable";
import { QuickLinkForm } from "./QuickLinkForm";

interface QuickLinkTableProps {
  links: QuickLink[];
}

export function QuickLinkTable({ links }: QuickLinkTableProps) {
  const router = useRouter();
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const [formOpened, { open: openForm, close: closeForm }] = useDisclosure(false);
  const [editing, setEditing] = useState<QuickLink | null>(null);
  const [pendingDelete, setPendingDelete] = useState<QuickLink | null>(null);
  const [deleting, setDeleting] = useState(false);

  function openCreate() {
    setEditing(null);
    openForm();
  }

  function openEdit(link: QuickLink) {
    setEditing(link);
    openForm();
  }

  function iconTint(color: string | null): string | undefined {
    return color && theme.colors[color] ? theme.colors[color][8] : undefined;
  }

  async function move(link: QuickLink, direction: "up" | "down") {
    const result = await moveQuickLink(link.id, direction);
    if (result.ok) {
      router.refresh();
    } else {
      notifications.show({ color: "red", message: result.error });
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) {
      return;
    }
    setDeleting(true);
    try {
      const result = await deleteQuickLink(pendingDelete.id);
      setPendingDelete(null);
      if (result.ok) {
        notifications.show({ color: "green", message: "Quick link deleted" });
        router.refresh();
      } else {
        notifications.show({ color: "red", message: result.error });
      }
    } finally {
      setDeleting(false);
    }
  }

  // Shared row/card actions: move up/down + delete, with click propagation
  // stopped so the row's own edit handler doesn't fire along with a tap.
  function actionsFor(link: QuickLink, index: number) {
    return (
      <Group gap={4} wrap="nowrap" onClick={(e) => e.stopPropagation()}>
        <Tooltip label="Move up" position="top">
          <ActionIcon
            variant="default"
            size="sm"
            aria-label={`Move ${link.label} up`}
            disabled={index === 0}
            onClick={() => move(link, "up")}
          >
            <IconChevronUp size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Move down" position="top">
          <ActionIcon
            variant="default"
            size="sm"
            aria-label={`Move ${link.label} down`}
            disabled={index === links.length - 1}
            onClick={() => move(link, "down")}
          >
            <IconChevronDown size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Delete" position="top">
          <ActionIcon
            variant="default"
            color="red"
            size="sm"
            aria-label={`Delete ${link.label}`}
            onClick={() => setPendingDelete(link)}
          >
            <IconTrash size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>
    );
  }

  return (
    <Stack pb="xl" gap="sm" className={CONTENT_ENTER_CLASS}>
      {/* Desktop: full-size create button instead of the FAB (like the
          webhook tab); rendered above the list so it is still available
          when empty. */}
      <Paper withBorder p="sm" visibleFrom="lg">
        <Group justify="flex-end" wrap="nowrap">
          <Button
            __vars={{ "--button-height": "43px" }}
            leftSection={<IconPlus size={16} />}
            onClick={openCreate}
          >
            Add quick link
          </Button>
        </Group>
      </Paper>

      {links.length === 0 ? (
        <Text c="dimmed" ta="center" py="lg">
          No quick links yet. Enabled links appear in the quick-links menu on the
          Calendar page.
        </Text>
      ) : (
        <>
          {/* Mobile: card list */}
          <Stack gap="sm" hiddenFrom="lg">
            {links.map((link, index) => (
              <Paper
                key={link.id}
                withBorder
                p="sm"
                onClick={() => openEdit(link)}
                {...activatable(() => openEdit(link))}
                style={{ cursor: "pointer" }}
              >
                <Stack gap="xs">
                  <Group justify="space-between" wrap="nowrap" style={{ minWidth: 0 }}>
                    <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
                      <QuickLinkIcon iconKey={link.icon} size={20} color={iconTint(link.color)} />
                      <Text fw={600} truncate>
                        {link.label}
                      </Text>
                    </Group>
                    <Badge size="sm" variant="light" color={link.enabled ? "green" : "gray"}>
                      {link.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </Group>
                  <Code fz="xs" style={{ wordBreak: "break-all" }}>
                    {link.url}
                  </Code>
                  {actionsFor(link, index)}
                </Stack>
              </Paper>
            ))}
          </Stack>

          {/* Desktop: data table */}
          <Paper withBorder visibleFrom="lg">
            <Table withRowBorders={false} highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Label</Table.Th>
                  <Table.Th>URL</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {links.map((link, index) => (
                  <Table.Tr
                    key={link.id}
                    onClick={() => openEdit(link)}
                    {...activatable(() => openEdit(link))}
                    style={{ cursor: "pointer" }}
                  >
                    <Table.Td>
                      <Group gap={8} wrap="nowrap">
                        <QuickLinkIcon iconKey={link.icon} size={18} color={iconTint(link.color)} />
                        <Text fw={600}>{link.label}</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Code fz="sm">{link.url}</Code>
                    </Table.Td>
                    <Table.Td>
                      <Badge size="sm" variant="light" color={link.enabled ? "green" : "gray"}>
                        {link.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{actionsFor(link, index)}</Table.Td>
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
        title={editing ? "Edit quick link" : "Add quick link"}
        centered
        size={isDesktop ? "md" : "sm"}
      >
        <QuickLinkForm
          key={editing?.id ?? "new"}
          link={
            editing
              ? {
                  id: editing.id,
                  label: editing.label,
                  url: editing.url,
                  icon: editing.icon,
                  color: editing.color,
                  enabled: editing.enabled,
                }
              : null
          }
          onDone={() => {
            closeForm();
            setEditing(null);
            router.refresh();
          }}
        />
      </Modal>

      <Modal
        opened={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Delete quick link"
        centered
        size="sm"
      >
        <Stack>
          <Text>
            Delete &quot;{pendingDelete?.label}&quot;? It will no longer appear in the
            quick-links menu.
          </Text>
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={deleting}
              loaderProps={BUTTON_LOADER_PROPS}
              onClick={confirmDelete}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Mobile-only: at lg the "Add quick link" button replaces the FAB.
          hiddenFrom sits on the toolbar itself: its Affix portals to <body>,
          so a wrapper element could not hide it. */}
      <FloatingToolbar bottomOffset="var(--settings-fab-bottom)" hiddenFrom="lg">
        <FloatingActionButton aria-label="Add quick link" onClick={openCreate}>
          <IconPlus size={FAB_ICON_SIZE} />
        </FloatingActionButton>
      </FloatingToolbar>
    </Stack>
  );
}
