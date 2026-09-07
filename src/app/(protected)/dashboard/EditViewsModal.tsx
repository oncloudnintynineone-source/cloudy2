"use client";

import { useState } from "react";
import {
  ActionIcon,
  Button,
  Group,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Tooltip,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconPencil, IconPlus, IconTrash, IconX } from "@tabler/icons-react";

import {
  deleteDashboardView,
  renameDashboardView,
  reorderDashboardViews,
} from "@/lib/dashboardViews/actions";
import type { DashboardViewTab } from "@/lib/dashboardViews/views";
import { BUTTON_LOADER_PROPS, NARROW_MEDIA_QUERY } from "@/lib/theme";
import {
  ROW_ACTION_ICON_SIZE,
  ROW_ACTION_SIZE,
  ROW_CARD_GAP,
  ReorderUpDown,
} from "@/components/reorderUpDown";
import { VIEW_TAB_META } from "./viewMeta";

interface EditViewsModalProps {
  opened: boolean;
  onClose: () => void;
  /** The account's tabs in strip order. */
  tabs: DashboardViewTab[];
  /** The tab currently rendered behind the modal. */
  activeView: DashboardViewTab;
  /** A list mutation landed (rename/reorder/non-active delete) — refresh. */
  onMutated: () => void;
  /** Navigate to a tab (used when the active tab was deleted). */
  onNavigateToView: (tab: DashboardViewTab) => void;
  /** Open the "Add view" kind-picker dialog. */
  onAddView: () => void;
}

export function EditViewsModal({
  opened,
  onClose,
  tabs,
  activeView,
  onMutated,
  onNavigateToView,
  onAddView,
}: EditViewsModalProps) {
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const isNarrow = useMediaQuery(NARROW_MEDIA_QUERY);

  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renamingBusy, setRenamingBusy] = useState(false);
  const [deleting, setDeleting] = useState<DashboardViewTab | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);

  function close() {
    setRenaming(null);
    setDeleting(null);
    onClose();
  }

  function startRename(tab: DashboardViewTab) {
    setRenaming({ id: tab.id, name: tab.name });
    setRenameDraft(tab.name);
  }

  async function submitRename() {
    if (!renaming || renamingBusy) {
      return;
    }
    const draft = renameDraft.trim();
    if (draft.length === 0) {
      return;
    }
    setRenamingBusy(true);
    try {
      const result = await renameDashboardView(renaming.id, { name: draft });
      if (result.ok) {
        notifications.show({ color: "green", message: "View renamed" });
        setRenaming(null);
        onMutated();
      } else {
        notifications.show({ color: "red", message: result.error });
      }
    } finally {
      setRenamingBusy(false);
    }
  }

  async function moveView(tab: DashboardViewTab, direction: "up" | "down") {
    const key = `${tab.id}:${direction}`;
    if (moving) {
      return;
    }
    const index = tabs.findIndex((candidate) => candidate.id === tab.id);
    const neighborIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || neighborIndex < 0 || neighborIndex >= tabs.length) {
      return;
    }
    const reordered = [...tabs];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(neighborIndex, 0, moved);
    setMoving(key);
    try {
      const result = await reorderDashboardViews(reordered.map((view) => view.id));
      if (result.ok) {
        onMutated();
      } else {
        notifications.show({ color: "red", message: result.error });
      }
    } finally {
      setMoving(null);
    }
  }

  async function confirmDelete() {
    if (!deleting || deletingBusy) {
      return;
    }
    setDeletingBusy(true);
    try {
      const result = await deleteDashboardView(deleting.id);
      if (!result.ok) {
        notifications.show({ color: "red", message: result.error });
        return;
      }
      notifications.show({ color: "green", message: "View deleted" });
      const target = deleting;
      setDeleting(null);
      const remaining = tabs.filter((tab) => tab.id !== target.id);
      if (target.id === activeView.id && remaining.length > 0) {
        onNavigateToView(remaining[0]);
      } else {
        onMutated();
      }
    } finally {
      setDeletingBusy(false);
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={close}
      title="Edit views"
      centered
      size={isNarrow ? "xs" : isDesktop ? "md" : "sm"}
    >
      <Stack>
        <Text size="sm" c="dimmed">
          Your calendar tabs, in strip order. Move them with the arrows; the first and last tabs
          can&rsquo;t move past the end. Rename or delete any tab.
        </Text>

        {tabs.length === 0 ? (
          <Text size="sm" c="dimmed">
            No views yet. Add one below.
          </Text>
        ) : (
          <ScrollArea.Autosize mah="min(60vh, 420px)" mx="-sm" px="sm">
            <Stack gap={ROW_CARD_GAP}>
              {tabs.map((tab, index) => {
                const isRenaming = renaming?.id === tab.id;
                const meta = VIEW_TAB_META[tab.kind];
                return (
                  <Paper key={tab.id} withBorder radius="md" p="sm">
                    <Group justify="space-between" align="center" wrap="nowrap">
                      <Group wrap="nowrap" gap="sm" align="center" style={{ minWidth: 0, flex: 1 }}>
                        <ReorderUpDown
                          name={tab.name}
                          upDisabled={index === 0}
                          downDisabled={index === tabs.length - 1}
                          busyUp={moving === `${tab.id}:up`}
                          busyDown={moving === `${tab.id}:down`}
                          onUp={() => void moveView(tab, "up")}
                          onDown={() => void moveView(tab, "down")}
                        />
                        {isRenaming ? (
                          <Group
                            wrap="nowrap"
                            gap={4}
                            align="center"
                            style={{ minWidth: 0, flex: 1 }}
                          >
                            <TextInput
                              size="md"
                              value={renameDraft}
                              maxLength={40}
                              aria-label={`Rename ${tab.name}`}
                              autoFocus
                              style={{ flex: 1, minWidth: 0 }}
                              onChange={(event) => setRenameDraft(event.currentTarget.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  void submitRename();
                                }
                                if (event.key === "Escape") {
                                  setRenaming(null);
                                }
                              }}
                            />
                            <Tooltip label="Save" position="top">
                              <ActionIcon
                                size={ROW_ACTION_SIZE}
                                aria-label={`Save renamed ${tab.name}`}
                                loading={renamingBusy}
                                loaderProps={BUTTON_LOADER_PROPS}
                                onClick={() => void submitRename()}
                              >
                                <IconCheck size={ROW_ACTION_ICON_SIZE} />
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label="Cancel" position="top">
                              <ActionIcon
                                size={ROW_ACTION_SIZE}
                                aria-label={`Cancel renaming ${tab.name}`}
                                onClick={() => setRenaming(null)}
                              >
                                <IconX size={ROW_ACTION_ICON_SIZE} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                        ) : (
                          <Group
                            wrap="nowrap"
                            gap="sm"
                            align="center"
                            style={{ minWidth: 0, flex: 1 }}
                          >
                            {meta.icon}
                            <Text fw={600} size="md" truncate>
                              {tab.name}
                            </Text>
                          </Group>
                        )}
                      </Group>
                      {!isRenaming && (
                        <Group wrap="nowrap" gap={4} style={{ flexShrink: 0 }}>
                          <Tooltip label="Rename" position="top">
                            <ActionIcon
                              variant="default"
                              size={ROW_ACTION_SIZE}
                              aria-label={`Rename ${tab.name}`}
                              onClick={() => startRename(tab)}
                            >
                              <IconPencil size={ROW_ACTION_ICON_SIZE} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip
                            label={tabs.length === 1 ? "Your last view can't be deleted" : "Delete"}
                            position="top"
                          >
                            <ActionIcon
                              variant="light"
                              color="red"
                              size={ROW_ACTION_SIZE}
                              aria-label={`Delete ${tab.name}`}
                              disabled={tabs.length === 1}
                              onClick={() => setDeleting(tab)}
                            >
                              <IconTrash size={ROW_ACTION_ICON_SIZE} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      )}
                    </Group>
                  </Paper>
                );
              })}
            </Stack>
          </ScrollArea.Autosize>
        )}

        <Group justify="flex-end">
          <Button
            variant="default"
            leftSection={<IconPlus size={16} />}
            onClick={() => {
              close();
              onAddView();
            }}
          >
            Add view
          </Button>
        </Group>
      </Stack>

      <Modal
        opened={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete view"
        centered
        size="sm"
      >
        <Stack>
          <Text>Delete &ldquo;{deleting?.name}&rdquo;?</Text>
          <Text size="sm" c="dimmed">
            This only removes the view — your events and their filters are untouched.
          </Text>
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={deletingBusy}
              loaderProps={BUTTON_LOADER_PROPS}
              onClick={() => void confirmDelete()}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Modal>
  );
}
