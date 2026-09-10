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
import {
  IconCheck,
  IconPencil,
  IconPlus,
  IconSwitchHorizontal,
  IconTrash,
  IconX,
} from "@tabler/icons-react";

import {
  changeDashboardViewKind,
  deleteDashboardView,
  renameDashboardView,
  reorderDashboardViews,
} from "@/lib/dashboardViews/actions";
import type { DashboardViewTab, DashboardViewKind } from "@/lib/dashboardViews/views";
import { BUTTON_LOADER_PROPS, NARROW_MEDIA_QUERY } from "@/lib/theme";
import { swapAdjacent, useReorderRows } from "@/lib/ui/reorderRows";
import {
  ROW_ACTION_ICON_SIZE,
  ROW_ACTION_SIZE,
  ROW_CARD_GAP,
  ReorderUpDown,
} from "@/components/reorderUpDown";
import { VIEW_TAB_META } from "./viewMeta";
import { ViewTypePicker } from "./ViewTypePicker";

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
  const [changing, setChanging] = useState<DashboardViewTab | null>(null);
  const [changeKind, setChangeKind] = useState<DashboardViewKind>("month");
  const [changingBusy, setChangingBusy] = useState(false);

  const {
    displayRows: displayTabs,
    containerRef,
    move: reorderView,
    busy,
  } = useReorderRows({
    rows: tabs,
    keyOf: (tab) => tab.id,
    predict: (current, id, delta) => swapAdjacent(current, (tab) => tab.id, id, delta),
    persist: async (next) => {
      const result = await reorderDashboardViews(next.map((view) => view.id));
      if (result.ok) {
        onMutated();
        return true;
      }
      notifications.show({ color: "red", message: result.error });
      return false;
    },
  });

  function close() {
    setRenaming(null);
    setDeleting(null);
    setChanging(null);
    onClose();
  }

  function startRename(tab: DashboardViewTab) {
    setRenaming({ id: tab.id, name: tab.name });
    setRenameDraft(tab.name);
  }

  /** Open the "Change type" dialog for a row, pre-selected to its kind. */
  function startChangeType(tab: DashboardViewTab) {
    setChanging(tab);
    setChangeKind(tab.kind);
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

  async function submitChangeType() {
    if (!changing || changingBusy || changeKind === changing.kind) {
      return;
    }
    const target = changing;
    const kind = changeKind;
    setChangingBusy(true);
    try {
      const result = await changeDashboardViewKind(target.id, { kind });
      if (!result.ok) {
        notifications.show({ color: "red", message: result.error });
        return;
      }
      notifications.show({ color: "green", message: "View type changed" });
      setChanging(null);
      if (target.id === activeView.id) {
        // The active tab re-navigates to the same id under its new kind, so
        // the dashboard re-renders through the usual tab-switch period rules
        // (Month → anchored starts today, anchored → Month keeps the month…).
        onNavigateToView({ ...target, kind });
      } else {
        onMutated();
      }
    } finally {
      setChangingBusy(false);
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
      <Stack ref={containerRef}>
        <Text size="sm" c="dimmed">
          Your calendar views, in strip order. Move them with the arrows; the first and last views
          can&rsquo;t move past the end. Rename or delete any view.
        </Text>

        {displayTabs.length === 0 ? (
          <Text size="sm" c="dimmed">
            No views yet. Add one below.
          </Text>
        ) : (
          <ScrollArea.Autosize mah="min(60vh, 420px)" mx="-sm" px="sm">
            <Stack gap={ROW_CARD_GAP} data-flip-container>
              {displayTabs.map((tab, index) => {
                const isRenaming = renaming?.id === tab.id;
                const meta = VIEW_TAB_META[tab.kind];
                const chevrons = (
                  <ReorderUpDown
                    name={tab.name}
                    upDisabled={busy || index === 0}
                    downDisabled={busy || index === displayTabs.length - 1}
                    onUp={() => void reorderView(tab.id, -1)}
                    onDown={() => void reorderView(tab.id, 1)}
                  />
                );
                const title = isRenaming ? (
                  <Group wrap="nowrap" gap={4} align="center" style={{ minWidth: 0, flex: 1 }}>
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
                  <Group wrap="nowrap" gap="sm" align="center" style={{ minWidth: 0, flex: 1 }}>
                    {meta.icon}
                    <Text fw={600} size="md" truncate>
                      {tab.name}
                    </Text>
                  </Group>
                );
                const actions = (
                  <>
                    <Tooltip label="Change type" position="top">
                      <ActionIcon
                        variant="default"
                        size={ROW_ACTION_SIZE}
                        aria-label={`Change type of ${tab.name}`}
                        onClick={() => startChangeType(tab)}
                      >
                        <IconSwitchHorizontal size={ROW_ACTION_ICON_SIZE} />
                      </ActionIcon>
                    </Tooltip>
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
                  </>
                );
                return (
                  <Paper key={tab.id} withBorder radius="md" p="sm" data-flip-id={tab.id}>
                    {isDesktop ? (
                      <Group justify="space-between" align="center" wrap="nowrap">
                        <Group
                          wrap="nowrap"
                          gap="sm"
                          align="center"
                          style={{ minWidth: 0, flex: 1 }}
                        >
                          {chevrons}
                          {title}
                        </Group>
                        {!isRenaming && (
                          <Group wrap="nowrap" gap={4} style={{ flexShrink: 0 }}>
                            {actions}
                          </Group>
                        )}
                      </Group>
                    ) : (
                      <Stack gap={6}>
                        <Group wrap="nowrap" gap="sm" align="center" style={{ minWidth: 0 }}>
                          {title}
                        </Group>
                        {!isRenaming && (
                          <Group wrap="nowrap" gap={4} align="center">
                            {chevrons}
                            {actions}
                          </Group>
                        )}
                      </Stack>
                    )}
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

      <Modal
        opened={changing !== null}
        onClose={() => setChanging(null)}
        title="Change view type"
        centered
        size={isNarrow ? "xs" : isDesktop ? "md" : "sm"}
      >
        <Stack>
          <Text size="sm" c="dimmed">
            &ldquo;{changing?.name}&rdquo; is currently a{" "}
            {changing ? VIEW_TAB_META[changing.kind].label : ""} view. Pick its new type — the tab
            keeps its name (unless it is still the type&rsquo;s default), filters and position.
          </Text>
          {changing && (
            <ViewTypePicker
              value={changeKind}
              disabledKind={changing.kind}
              onSelect={setChangeKind}
            />
          )}
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setChanging(null)}>
              Cancel
            </Button>
            <Button
              disabled={!changing || changeKind === changing.kind}
              loading={changingBusy}
              loaderProps={BUTTON_LOADER_PROPS}
              onClick={() => void submitChangeType()}
            >
              Change type
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Modal>
  );
}
