"use client";

import { type ReactNode, useState } from "react";
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
  VisuallyHidden,
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { IconLink, IconPlus, IconTrash } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";

import { EmptyState } from "@/components/EmptyState";
import type { QuickLink } from "@/db/schema";
import { FAB_ICON_SIZE, FloatingActionButton, FloatingToolbar } from "@/components/FloatingToolbar";
import { QuickLinkIcon } from "@/components/QuickLinkIcon";
import { ROW_ACTION_ICON_SIZE, ROW_ACTION_SIZE, ReorderUpDown } from "@/components/reorderUpDown";
import { SortableList, SortableRow } from "@/components/SortableRow";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import { deleteQuickLink, moveQuickLink, reorderQuickLinks } from "@/lib/quickLinks/actions";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { moveToIndex, swapAdjacent, useReorderRows } from "@/lib/ui/reorderRows";
import { activatable } from "@/lib/ui/activatable";
import dynamic from "next/dynamic";
import { FormModalSkeleton } from "@/components/FormModalSkeleton";

// The add/edit quick-link form (with its icon picker) is only mounted on tap;
// split it out of the quick-links route's initial chunk.
const QuickLinkForm = dynamic(() => import("./QuickLinkForm").then((mod) => mod.QuickLinkForm), {
  ssr: false,
  loading: () => <FormModalSkeleton rows={4} />,
});
import { useActivityRefresh } from "@/components/ActivityBar";

interface QuickLinkTableProps {
  links: QuickLink[];
  dragEnabled: boolean;
}

export function QuickLinkTable({ links, dragEnabled }: QuickLinkTableProps) {
  const refreshAfterSave = useActivityRefresh("quick-links:save");
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const [formOpened, { open: openForm, close: closeForm }] = useDisclosure(false);
  const [editing, setEditing] = useState<QuickLink | null>(null);
  const [pendingDelete, setPendingDelete] = useState<QuickLink | null>(null);
  const [deleting, setDeleting] = useState(false);

  const {
    displayRows: displayLinks,
    containerRef,
    move: reorderLink,
    moveTo,
    busy,
  } = useReorderRows({
    rows: links,
    keyOf: (link) => link.id,
    predict: (current, id, delta) => swapAdjacent(current, (link) => link.id, id, delta),
    persist: async (_next, id, delta) => {
      const result = await moveQuickLink(id, delta === -1 ? "up" : "down");
      if (result.ok) {
        refreshAfterSave();
        return true;
      }
      notifications.show({ color: "red", message: result.error });
      return false;
    },
    predictMove: (current, id, toIndex) => moveToIndex(current, (link) => link.id, id, toIndex),
    persistOrder: async (next, id) => {
      const result = await reorderQuickLinks(
        next.map((link) => link.id),
        id,
      );
      if (result.ok) {
        refreshAfterSave();
        return true;
      }
      notifications.show({ color: "red", message: result.error });
      return false;
    },
  });

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
        refreshAfterSave();
      } else {
        notifications.show({ color: "red", message: result.error });
      }
    } finally {
      setDeleting(false);
    }
  }

  // Row actions — reorder chevrons lead (left), delete trails (right). Click
  // propagation is stopped so the row/card's own edit handler doesn't fire
  // along with a tap on a control.
  function reorderFor(link: QuickLink, index: number, handle: ReactNode) {
    return (
      <Group gap={4} wrap="nowrap">
        {handle}
        <ReorderUpDown
          name={link.label}
          upDisabled={busy || index === 0}
          downDisabled={busy || index === links.length - 1}
          onUp={() => void reorderLink(link.id, -1)}
          onDown={() => void reorderLink(link.id, 1)}
        />
      </Group>
    );
  }

  function deleteControl(link: QuickLink) {
    return (
      <Group gap={4} wrap="nowrap" onClick={(e) => e.stopPropagation()}>
        <Tooltip label="Delete" position="top">
          <ActionIcon
            variant="light"
            color="red"
            size={ROW_ACTION_SIZE}
            aria-label={`Delete ${link.label}`}
            onClick={() => setPendingDelete(link)}
          >
            <IconTrash size={ROW_ACTION_ICON_SIZE} />
          </ActionIcon>
        </Tooltip>
      </Group>
    );
  }

  return (
    <Stack pb="xl" className={CONTENT_ENTER_CLASS} ref={containerRef}>
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
        <EmptyState
          icon={<IconLink size={18} />}
          description="No quick links yet. Enabled links appear in the quick-links menu on the Calendar page."
          actionLabel="Add quick link"
          onAction={openCreate}
        />
      ) : (
        <>
          {/* Mobile: card list */}
          <SortableList
            keys={displayLinks.map((link) => link.id)}
            onMove={(id, toIndex) => void moveTo(id, toIndex)}
          >
            <Stack gap="sm" hiddenFrom="lg" data-flip-container>
              {displayLinks.map((link, index) => (
                <SortableRow
                  key={link.id}
                  id={link.id}
                  index={index}
                  name={link.label}
                  enabled={dragEnabled}
                >
                  {({ ref, handle }) => (
                    <Paper
                      ref={ref}
                      withBorder
                      p="sm"
                      data-flip-id={link.id}
                      onClick={() => openEdit(link)}
                      {...activatable(() => openEdit(link))}
                      style={{ cursor: "pointer" }}
                    >
                      <Stack gap="xs">
                        <Group justify="space-between" wrap="nowrap" style={{ minWidth: 0 }}>
                          <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
                            <QuickLinkIcon
                              iconKey={link.icon}
                              size={20}
                              color={iconTint(link.color)}
                            />
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
                        <Group justify="space-between" wrap="nowrap" align="center">
                          {reorderFor(link, index, handle)}
                          {deleteControl(link)}
                        </Group>
                      </Stack>
                    </Paper>
                  )}
                </SortableRow>
              ))}
            </Stack>
          </SortableList>

          {/* Desktop: data table */}
          <SortableList
            keys={displayLinks.map((link) => link.id)}
            onMove={(id, toIndex) => void moveTo(id, toIndex)}
          >
            <Paper withBorder visibleFrom="lg" data-flip-container>
              <Table withRowBorders={false} highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Label</Table.Th>
                    <Table.Th>URL</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th ta="right">
                      <VisuallyHidden>Actions</VisuallyHidden>
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {displayLinks.map((link, index) => (
                    <SortableRow
                      key={link.id}
                      id={link.id}
                      index={index}
                      name={link.label}
                      enabled={dragEnabled}
                    >
                      {({ ref, handle }) => (
                        <Table.Tr
                          ref={ref}
                          data-flip-id={link.id}
                          onClick={() => openEdit(link)}
                          {...activatable(() => openEdit(link))}
                          style={{ cursor: "pointer" }}
                        >
                          <Table.Td>
                            <Group gap={8} wrap="nowrap">
                              <QuickLinkIcon
                                iconKey={link.icon}
                                size={18}
                                color={iconTint(link.color)}
                              />
                              <Text fw={600}>{link.label}</Text>
                            </Group>
                          </Table.Td>
                          <Table.Td>
                            <Code fz="sm">{link.url}</Code>
                          </Table.Td>
                          <Table.Td>
                            <Badge
                              size="sm"
                              variant="light"
                              color={link.enabled ? "green" : "gray"}
                            >
                              {link.enabled ? "Enabled" : "Disabled"}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            <Group wrap="nowrap" gap={4} align="center">
                              {reorderFor(link, index, handle)}
                              {deleteControl(link)}
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      )}
                    </SortableRow>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>
          </SortableList>
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
            refreshAfterSave();
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
            Delete &quot;{pendingDelete?.label}&quot;? It will no longer appear in the quick-links
            menu.
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
