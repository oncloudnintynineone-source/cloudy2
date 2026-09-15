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
import { IconFilter, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";

import {
  changeDashboardViewKind,
  deleteDashboardView,
  renameDashboardView,
  reorderDashboardViews,
} from "@/lib/dashboardViews/actions";
import {
  DASHBOARD_VIEW_KIND_LABELS,
  DASHBOARD_VIEW_NAME_MAX_LENGTH,
  type DashboardViewTab,
  type DashboardViewKind,
} from "@/lib/dashboardViews/views";
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
  /** Navigate to a tab (or the active tab's new kind after an edit). `force`
   *  forces a server re-read for a CRUD navigation whose tab list changed. */
  onNavigateToView: (
    tab: Pick<DashboardViewTab, "id" | "kind">,
    options?: { force?: boolean },
  ) => void;
  /** Switch to a tab and open its filter dialog (the Edit dialog's Filters). */
  onEditFilters: (tab: DashboardViewTab) => void;
  /** Open the quick "Add view" dialog (the strip's + flow). */
  onAddView: () => void;
}

export function EditViewsModal({
  opened,
  onClose,
  tabs,
  activeView,
  onMutated,
  onNavigateToView,
  onEditFilters,
  onAddView,
}: EditViewsModalProps) {
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const isNarrow = useMediaQuery(NARROW_MEDIA_QUERY);

  // "Edit view" dialog draft (name + kind in one place).
  const [editing, setEditing] = useState<DashboardViewTab | null>(null);
  const [editName, setEditName] = useState("");
  const [editKind, setEditKind] = useState<DashboardViewKind>("month");
  const [editBusy, setEditBusy] = useState(false);

  const [deleting, setDeleting] = useState<DashboardViewTab | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

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
    setEditing(null);
    setDeleting(null);
    onClose();
  }

  function startEdit(tab: DashboardViewTab) {
    setEditing(tab);
    setEditName(tab.name);
    setEditKind(tab.kind);
  }

  async function submitEdit() {
    if (!editing || editBusy) {
      return;
    }
    const name = editName.trim();
    if (name.length === 0) {
      return;
    }
    const target = editing;
    const kindChanged = editKind !== target.kind;
    const nameChanged = name !== target.name;
    if (!kindChanged && !nameChanged) {
      setEditing(null);
      return;
    }
    setEditBusy(true);
    try {
      // Kind first: `changeDashboardViewKind` may adopt the new kind's default
      // name when the tab still carries the old default, so a custom name typed
      // here must be applied afterwards to win.
      if (kindChanged) {
        const result = await changeDashboardViewKind(target.id, { kind: editKind });
        if (!result.ok) {
          notifications.show({ color: "red", message: result.error });
          return;
        }
      }
      if (nameChanged) {
        const result = await renameDashboardView(target.id, { name });
        if (!result.ok) {
          notifications.show({ color: "red", message: result.error });
          return;
        }
      }
      notifications.show({ color: "green", message: "View updated" });
      setEditing(null);
      if (kindChanged && target.id === activeView.id) {
        // A kind change on the active tab re-navigates to the same id under its
        // new kind, so the dashboard re-renders through the usual tab-switch
        // period rules (Month → anchored starts today, anchored → Month keeps
        // the month…). `switchTab` also forces a server re-read, since the
        // request key is definition-blind and the same id would otherwise look
        // already covered. A name-only edit (or any inactive edit) just
        // refreshes.
        onNavigateToView({ id: target.id, kind: editKind });
      } else {
        onMutated();
      }
    } finally {
      setEditBusy(false);
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
        // Force a re-read: the held tab list still contains the deleted row, so
        // a data-equivalent next tab would swap locally and leave it behind.
        onNavigateToView(remaining[0], { force: true });
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
      title="Manage views"
      centered
      size={isNarrow ? "xs" : isDesktop ? "md" : "sm"}
    >
      <Stack ref={containerRef}>
        <Text size="sm" c="dimmed">
          Reorder with the arrows; Edit handles a view&rsquo;s name, type and filters.
        </Text>
        <Group>
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

        {displayTabs.length === 0 ? (
          <Text size="sm" c="dimmed">
            No views yet. Add one above.
          </Text>
        ) : (
          <ScrollArea.Autosize mah="min(60vh, 420px)" mx="-sm" px="sm">
            <Stack gap={ROW_CARD_GAP} data-flip-container>
              {displayTabs.map((tab, index) => {
                const meta = VIEW_TAB_META[tab.kind];
                const isActive = tab.id === activeView.id;
                // The kind label only adds information when the name is custom
                // — otherwise it just repeats the name ("Month / Month").
                const showKind = tab.name !== DASHBOARD_VIEW_KIND_LABELS[tab.kind];
                const chevrons = (
                  <ReorderUpDown
                    name={tab.name}
                    variant="subtle"
                    upDisabled={busy || index === 0}
                    downDisabled={busy || index === displayTabs.length - 1}
                    onUp={() => void reorderView(tab.id, -1)}
                    onDown={() => void reorderView(tab.id, 1)}
                  />
                );
                const title = (
                  <Group wrap="nowrap" gap="sm" align="center" style={{ minWidth: 0, flex: 1 }}>
                    {meta.icon}
                    <Stack gap={0} style={{ minWidth: 0, flex: 1 }}>
                      <Text fw={600} size="md" truncate>
                        {tab.name}
                      </Text>
                      {showKind && (
                        <Text size="xs" c="dimmed" truncate>
                          {meta.label}
                        </Text>
                      )}
                    </Stack>
                  </Group>
                );
                const actions = (
                  <>
                    <Tooltip label="Edit" position="top">
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        size={ROW_ACTION_SIZE}
                        aria-label={`Edit ${tab.name}`}
                        onClick={() => startEdit(tab)}
                      >
                        <IconPencil size={ROW_ACTION_ICON_SIZE} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip
                      label={tabs.length === 1 ? "Your last view can't be deleted" : "Delete"}
                      position="top"
                    >
                      <ActionIcon
                        variant="subtle"
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
                  <Paper
                    key={tab.id}
                    withBorder
                    radius="md"
                    p="sm"
                    data-flip-id={tab.id}
                    style={
                      isActive
                        ? { borderLeft: "3px solid var(--mantine-color-accent-6)" }
                        : undefined
                    }
                  >
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
                        <Group wrap="nowrap" gap={4} style={{ flexShrink: 0 }}>
                          {actions}
                        </Group>
                      </Group>
                    ) : (
                      <Stack gap={6}>
                        {title}
                        <Group wrap="nowrap" gap={4} align="center">
                          {chevrons}
                          {actions}
                        </Group>
                      </Stack>
                    )}
                  </Paper>
                );
              })}
            </Stack>
          </ScrollArea.Autosize>
        )}
      </Stack>

      <Modal
        opened={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit view"
        centered
        size={isNarrow ? "xs" : isDesktop ? "md" : "sm"}
      >
        <Stack>
          <TextInput
            label="Name"
            value={editName}
            maxLength={DASHBOARD_VIEW_NAME_MAX_LENGTH}
            onChange={(event) => setEditName(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submitEdit();
              }
            }}
            autoFocus
          />
          <div>
            <Text fw={600} size="sm" mb={6}>
              View type
            </Text>
            <ViewTypePicker
              value={editKind}
              disabledKind={editing?.kind}
              onSelect={setEditKind}
              variant="thumbnail"
            />
          </div>
          <div>
            <Text fw={600} size="sm" mb={6}>
              Filters
            </Text>
            <Button
              variant="default"
              leftSection={<IconFilter size={16} />}
              fullWidth
              onClick={() => {
                if (!editing) return;
                const target = editing;
                setEditing(null);
                onEditFilters(target);
              }}
            >
              Edit filters&hellip;
            </Button>
            <Text size="xs" c="dimmed" mt={6}>
              Opens this view&rsquo;s filter dialog (switches to it first).
            </Text>
          </div>
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              disabled={!editing || (editKind === editing.kind && editName.trim() === editing.name)}
              loading={editBusy}
              loaderProps={BUTTON_LOADER_PROPS}
              onClick={() => void submitEdit()}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>

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
