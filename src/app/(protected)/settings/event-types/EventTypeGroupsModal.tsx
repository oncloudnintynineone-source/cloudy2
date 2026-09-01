"use client";

import { useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconPencil,
  IconPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react";

import {
  createEventTypeGroup,
  deleteEventTypeGroup,
  moveEventTypeGroup,
  renameEventTypeGroup,
} from "@/lib/eventTypes/groupActions";
import { sortEventTypeGroups, UNGROUPED_LABEL } from "@/lib/eventTypes/groups";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";

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
  const [moving, setMoving] = useState<string | null>(null);

  const sorted = sortEventTypeGroups(groups);

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

  async function handleMove(id: string, name: string, direction: "up" | "down") {
    const key = `${id}:${direction}`;
    if (moving) {
      return;
    }
    setMoving(key);
    try {
      const result = await moveEventTypeGroup(id, direction);
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
    <Modal opened={opened} onClose={close} title="Event type groups" centered size="md">
      <Stack>
        <Text size="sm" c="dimmed">
          Groups are the categories event types appear under in the event form. Reorder them
          with the arrows; event types keep their alphabetical order inside a group.
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

        {sorted.length === 0 ? (
          <Text size="sm" c="dimmed">
            No groups yet. Without groups, event types appear in one alphabetical list.
          </Text>
        ) : (
          <Stack gap={4}>
            {sorted.map((group, index) => {
              const count = typeCounts.get(group.id) ?? 0;
              const isRenaming = renaming?.id === group.id;
              return (
                <Group key={group.id} justify="space-between" align="center" wrap="nowrap">
                  <Group wrap="nowrap" gap={4} align="center" style={{ minWidth: 0, flex: 1 }}>
                    <Tooltip label="Move up" position="top">
                      <ActionIcon
                        variant="default"
                        size="sm"
                        aria-label={`Move ${group.name} up`}
                        disabled={index === 0}
                        loading={moving === `${group.id}:up`}
                        loaderProps={BUTTON_LOADER_PROPS}
                        onClick={() => void handleMove(group.id, group.name, "up")}
                      >
                        <IconChevronUp size={16} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Move down" position="top">
                      <ActionIcon
                        variant="default"
                        size="sm"
                        aria-label={`Move ${group.name} down`}
                        disabled={index === sorted.length - 1}
                        loading={moving === `${group.id}:down`}
                        loaderProps={BUTTON_LOADER_PROPS}
                        onClick={() => void handleMove(group.id, group.name, "down")}
                      >
                        <IconChevronDown size={16} />
                      </ActionIcon>
                    </Tooltip>
                    {isRenaming ? (
                      <Group wrap="nowrap" gap={4} align="center" style={{ minWidth: 0, flex: 1 }}>
                        <TextInput
                          size="xs"
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
                            size="sm"
                            aria-label={`Save renamed ${group.name}`}
                            loading={renamingInProgress}
                            loaderProps={BUTTON_LOADER_PROPS}
                            onClick={() => void handleRenameSave()}
                          >
                            <IconCheck size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Cancel" position="top">
                          <ActionIcon
                            size="sm"
                            aria-label={`Cancel renaming ${group.name}`}
                            onClick={() => setRenaming(null)}
                          >
                            <IconX size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    ) : (
                      <>
                        <Text fw={600} truncate>
                          {group.name}
                        </Text>
                        <Badge size="sm" variant="light" color="gray">
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
                          size="sm"
                          aria-label={`Rename ${group.name}`}
                          onClick={() => startRename(group.id, group.name)}
                        >
                          <IconPencil size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Delete" position="top">
                        <ActionIcon
                          variant="light"
                          color="red"
                          size="sm"
                          aria-label={`Delete ${group.name}`}
                          onClick={() =>
                            setDeleting({ id: group.id, name: group.name, count })
                          }
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  )}
                </Group>
              );
            })}
          </Stack>
        )}
      </Stack>

      <Modal
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
      </Modal>
    </Modal>
  );
}
