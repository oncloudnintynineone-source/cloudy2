"use client";

import { useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { ResponsiveSheet } from "@/components/ResponsiveSheet";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconPencil, IconPlus, IconTrash, IconX } from "@tabler/icons-react";

import {
  createEventTypeGroup,
  deleteEventTypeGroup,
  moveEventTypeGroup,
  renameEventTypeGroup,
} from "@/lib/eventTypes/groupActions";
import {
  moveEventTypeGroupOrder,
  sortEventTypeGroups,
  UNGROUPED_LABEL,
} from "@/lib/eventTypes/groups";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { useReorderRows } from "@/lib/ui/reorderRows";
import {
  ROW_ACTION_ICON_SIZE,
  ROW_ACTION_SIZE,
  ROW_CARD_GAP,
  ReorderUpDown,
} from "@/components/reorderUpDown";

interface GroupRef {
  id: string;
  name: string;
  sortOrder: number;
}

interface EventTypeGroupsModalProps {
  opened: boolean;
  onClose: () => void;
  groups: GroupRef[];
  /** Number of event types assigned to each group (by group id). */
  typeCounts: Map<string, number>;
  /** The list changed (create/rename/delete/move) — the parent refreshes. */
  onMutated: () => void;
}

export function EventTypeGroupsModal({
  opened,
  onClose,
  groups,
  typeCounts,
  onMutated,
}: EventTypeGroupsModalProps) {
  const [newName, setNewName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renamingInProgress, setRenamingInProgress] = useState(false);
  const [deleting, setDeleting] = useState<{ id: string; name: string; count: number } | null>(
    null,
  );
  const [deletingInProgress, setDeletingInProgress] = useState(false);

  const sorted = sortEventTypeGroups(groups);

  const {
    displayRows: displaySorted,
    containerRef,
    move: reorderGroup,
    busy,
  } = useReorderRows({
    rows: sorted,
    keyOf: (group) => group.id,
    predict: (current, id, delta) =>
      moveEventTypeGroupOrder(current, id, delta === -1 ? "up" : "down"),
    persist: async (_next, id, delta) => {
      const result = await moveEventTypeGroup(id, delta === -1 ? "up" : "down");
      if (result.ok) {
        onMutated();
        return true;
      }
      notifications.show({ color: "red", message: result.error });
      return false;
    },
  });

  function close() {
    setNewName("");
    setNameError(null);
    setRenaming(null);
    setDeleting(null);
    onClose();
  }

  async function handleCreate() {
    if (creating) {
      return;
    }
    setCreating(true);
    try {
      const result = await createEventTypeGroup(newName);
      if (result.ok) {
        setNewName("");
        setNameError(null);
        notifications.show({ color: "green", message: "Event type group created" });
        onMutated();
      } else {
        if (result.field === "name") {
          setNameError(result.error);
        }
        notifications.show({ color: "red", message: result.error });
      }
    } finally {
      setCreating(false);
    }
  }

  function startRename(id: string, name: string) {
    setRenaming({ id, name });
    setRenameDraft(name);
  }

  async function handleRenameSave() {
    if (!renaming || renamingInProgress) {
      return;
    }
    setRenamingInProgress(true);
    try {
      const result = await renameEventTypeGroup(renaming.id, renameDraft);
      if (result.ok) {
        notifications.show({ color: "green", message: "Event type group renamed" });
        setRenaming(null);
        onMutated();
      } else {
        notifications.show({ color: "red", message: result.error });
      }
    } finally {
      setRenamingInProgress(false);
    }
  }

  async function confirmDelete() {
    if (!deleting || deletingInProgress) {
      return;
    }
    setDeletingInProgress(true);
    try {
      const result = await deleteEventTypeGroup(deleting.id);
      setDeleting(null);
      if (result.ok) {
        notifications.show({ color: "green", message: "Event type group deleted" });
        onMutated();
      } else {
        notifications.show({ color: "red", message: result.error });
      }
    } finally {
      setDeletingInProgress(false);
    }
  }

  return (
    <ResponsiveSheet opened={opened} onClose={close} title="Event type groups" centered size="md">
      <Stack ref={containerRef}>
        <Text size="sm" c="dimmed">
          Groups are the categories event types appear under in the event form. Reorder them with
          the arrows; event types keep their alphabetical order inside a group.
        </Text>

        <Stack gap="xs">
          <TextInput
            label="Group name"
            placeholder="Leave"
            value={newName}
            error={nameError}
            onChange={(event) => {
              setNewName(event.currentTarget.value);
              setNameError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleCreate();
              }
            }}
          />
          <Button
            leftSection={<IconPlus size={16} />}
            loading={creating}
            loaderProps={BUTTON_LOADER_PROPS}
            fullWidth
            onClick={() => void handleCreate()}
          >
            Add group
          </Button>
        </Stack>

        {displaySorted.length === 0 ? (
          <Text size="sm" c="dimmed">
            No groups yet. Without groups, event types appear in one alphabetical list.
          </Text>
        ) : (
          <Stack gap={ROW_CARD_GAP} data-flip-container>
            {displaySorted.map((group, index) => {
              const count = typeCounts.get(group.id) ?? 0;
              const isRenaming = renaming?.id === group.id;
              return (
                <Paper key={group.id} withBorder radius="md" p="sm" data-flip-id={group.id}>
                  <Group justify="space-between" align="center" wrap="nowrap">
                    <Group wrap="nowrap" gap="sm" align="center" style={{ minWidth: 0, flex: 1 }}>
                      <ReorderUpDown
                        name={group.name}
                        upDisabled={busy || index === 0}
                        downDisabled={busy || index === displaySorted.length - 1}
                        onUp={() => void reorderGroup(group.id, -1)}
                        onDown={() => void reorderGroup(group.id, 1)}
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
                            aria-label={`Rename ${group.name}`}
                            autoFocus
                            style={{ flex: 1, minWidth: 0 }}
                            onChange={(event) => setRenameDraft(event.currentTarget.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void handleRenameSave();
                              }
                              if (event.key === "Escape") {
                                setRenaming(null);
                              }
                            }}
                          />
                          <Tooltip label="Save" position="top">
                            <ActionIcon
                              size={ROW_ACTION_SIZE}
                              aria-label={`Save renamed ${group.name}`}
                              loading={renamingInProgress}
                              loaderProps={BUTTON_LOADER_PROPS}
                              onClick={() => void handleRenameSave()}
                            >
                              <IconCheck size={ROW_ACTION_ICON_SIZE} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Cancel" position="top">
                            <ActionIcon
                              size={ROW_ACTION_SIZE}
                              aria-label={`Cancel renaming ${group.name}`}
                              onClick={() => setRenaming(null)}
                            >
                              <IconX size={ROW_ACTION_ICON_SIZE} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      ) : (
                        <>
                          <Text fw={600} size="md" truncate>
                            {group.name}
                          </Text>
                          <Badge size="md" variant="light" color="gray" style={{ flexShrink: 0 }}>
                            {count} type{count === 1 ? "" : "s"}
                          </Badge>
                        </>
                      )}
                    </Group>
                    {!isRenaming && (
                      <Group wrap="nowrap" gap={4} style={{ flexShrink: 0 }}>
                        <Tooltip label="Rename" position="top">
                          <ActionIcon
                            variant="default"
                            size={ROW_ACTION_SIZE}
                            aria-label={`Rename ${group.name}`}
                            onClick={() => startRename(group.id, group.name)}
                          >
                            <IconPencil size={ROW_ACTION_ICON_SIZE} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Delete" position="top">
                          <ActionIcon
                            variant="light"
                            color="red"
                            size={ROW_ACTION_SIZE}
                            aria-label={`Delete ${group.name}`}
                            onClick={() => setDeleting({ id: group.id, name: group.name, count })}
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
        )}
      </Stack>

      <ResponsiveSheet
        opened={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete event type group"
        centered
        size="sm"
      >
        <Stack>
          <Text>Delete &quot;{deleting?.name}&quot;?</Text>
          {deleting && deleting.count > 0 && (
            <Text size="sm" c="dimmed">
              Its {deleting.count} event type{deleting.count === 1 ? "" : "s"} will move to the
              {UNGROUPED_LABEL} section of the event form.
            </Text>
          )}
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={deletingInProgress}
              loaderProps={BUTTON_LOADER_PROPS}
              onClick={() => void confirmDelete()}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </ResponsiveSheet>
    </ResponsiveSheet>
  );
}
