"use client";

import { type KeyboardEvent, type ReactNode, useMemo, useState } from "react";
import {
  Box,
  Button,
  Group,
  Modal,
  Paper,
  Stack,
  Table,
  Text,
  VisuallyHidden,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconSitemap } from "@tabler/icons-react";

import { EmptyState } from "@/components/EmptyState";
import type { Calendar } from "@/db/schema";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import { deleteDepartment, moveDepartment, reorderDepartments } from "@/lib/roster/actions";
import {
  buildDepartmentTree,
  moveAvailability,
  moveInTreeOrder,
  moveToSiblingIndex,
  type DepartmentTreeNode,
} from "@/lib/roster/hierarchy";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { useReorderRows } from "@/lib/ui/reorderRows";
import { FAB_ICON_SIZE, FloatingActionButton, FloatingToolbar } from "@/components/FloatingToolbar";
import { formatColorLabel } from "@/lib/events/eventColors";
import { ColorDot } from "@/components/ColorSwatchPicker";
import { ReorderUpDown } from "@/components/reorderUpDown";
import { SortableList, SortableRow } from "@/components/SortableRow";
import dynamic from "next/dynamic";
import { FormModalSkeleton } from "@/components/FormModalSkeleton";
import { useActivityRefresh } from "@/components/ActivityBar";

// The department detail form is large and only mounted on tap; split it out of
// the departments route's initial chunk.
const DepartmentDetail = dynamic(
  () => import("./DepartmentDetail").then((mod) => mod.DepartmentDetail),
  { ssr: false, loading: () => <FormModalSkeleton rows={5} /> },
);

interface DepartmentTableProps {
  departments: Calendar[];
  dragEnabled: boolean;
}

export function DepartmentTable({ departments, dragEnabled }: DepartmentTableProps) {
  const refreshAfterSave = useActivityRefresh("departments:save");
  const [detailOpened, { open: openDetail, close: closeDetail }] = useDisclosure(false);
  const [confirmOpened, { open: openConfirm, close: closeConfirm }] = useDisclosure(false);
  const [selected, setSelected] = useState<Calendar | null>(null);
  const [deleting, setDeleting] = useState<Calendar | null>(null);
  const [deletingInProgress, setDeletingInProgress] = useState(false);

  const {
    displayRows: displayDepartments,
    containerRef,
    move: reorderDepartment,
    moveTo,
    busy,
  } = useReorderRows({
    rows: departments,
    keyOf: (calendar) => calendar.id,
    predict: (rows, id, delta) => {
      const moved = moveInTreeOrder(rows, id, delta === -1 ? "up" : "down");
      if (!moved) {
        return null;
      }
      const byId = new Map(rows.map((calendar) => [calendar.id, calendar] as const));
      return moved
        .map((entry) => {
          const calendar = byId.get(entry.id);
          // Carry the re-ranked sortOrder: `displayRows` rebuilds the tree from
          // these rows and sorts siblings by sortOrder, so keeping the old
          // values would silently revert the optimistic move.
          return calendar ? { ...calendar, sortOrder: entry.sortOrder } : undefined;
        })
        .filter((calendar): calendar is Calendar => calendar !== undefined);
    },
    persist: async (_next, id, delta) => {
      const result = await moveDepartment(id, delta === -1 ? "up" : "down");
      if (result.ok) {
        refreshAfterSave();
        return true;
      }
      notifications.show({ color: "red", message: result.error });
      return false;
    },
    // Drag moves a department among its siblings only; the drop target is
    // normalized to the nearest sibling of the dragged node.
    predictMove: (rows, id, toIndex) => {
      const target = rows[toIndex];
      if (!target) {
        return null;
      }
      const moved = moveToSiblingIndex(rows, id, target.id);
      if (!moved) {
        return null;
      }
      const byId = new Map(rows.map((calendar) => [calendar.id, calendar] as const));
      return moved
        .map((entry) => {
          const calendar = byId.get(entry.id);
          return calendar ? { ...calendar, sortOrder: entry.sortOrder } : undefined;
        })
        .filter((calendar): calendar is Calendar => calendar !== undefined);
    },
    persistOrder: async (next, id) => {
      const result = await reorderDepartments(
        next.map((calendar) => calendar.id),
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

  const deletingChildCount = deleting
    ? departments.filter((calendar) => calendar.parentId === deleting.id).length
    : 0;

  // Preorder display (parent, then its children, indented by depth) and each
  // row's move availability (a department only moves among its siblings).
  const displayRows = useMemo(() => {
    const byId = new Map(displayDepartments.map((calendar) => [calendar.id, calendar]));
    const rows: { calendar: Calendar; depth: number; parent: Calendar | null }[] = [];
    const walk = (nodes: DepartmentTreeNode[], depth: number) => {
      for (const node of nodes) {
        const calendar = byId.get(node.id);
        if (!calendar) continue;
        rows.push({
          calendar,
          depth,
          parent: calendar.parentId ? (byId.get(calendar.parentId) ?? null) : null,
        });
        walk(node.children, depth + 1);
      }
    };
    walk(buildDepartmentTree(displayDepartments), 0);
    return rows;
  }, [displayDepartments]);

  const availability = useMemo(() => moveAvailability(departments), [departments]);

  function openCreate() {
    setSelected(null);
    openDetail();
  }

  function openDetails(calendar: Calendar) {
    setSelected(calendar);
    openDetail();
  }

  function requestDelete(calendar: Calendar) {
    setDeleting(calendar);
    closeDetail();
    openConfirm();
  }

  async function confirmDelete() {
    if (!deleting || deletingInProgress) {
      return;
    }
    setDeletingInProgress(true);
    try {
      const result = await deleteDepartment(deleting.id);
      if (result.ok) {
        notifications.show({ color: "green", message: "Department deleted" });
        closeConfirm();
        setDeleting(null);
        refreshAfterSave();
      } else {
        notifications.show({ color: "red", message: result.error });
      }
    } finally {
      setDeletingInProgress(false);
    }
  }

  function actionsFor(calendar: Calendar, handle: ReactNode) {
    const can = availability.get(calendar.id) ?? { up: false, down: false };
    return (
      <Group gap={4} wrap="nowrap">
        {handle}
        <ReorderUpDown
          name={calendar.name}
          upDisabled={busy || !can.up}
          downDisabled={busy || !can.down}
          onUp={() => void reorderDepartment(calendar.id, -1)}
          onDown={() => void reorderDepartment(calendar.id, 1)}
        />
      </Group>
    );
  }

  const openRow = (calendar: Calendar) => ({
    role: "button",
    tabIndex: 0,
    "aria-haspopup": "dialog" as const,
    "aria-label": `Open ${calendar.name} details`,
    onClick: () => openDetails(calendar),
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openDetails(calendar);
      }
    },
    style: { cursor: "pointer" },
  });

  return (
    <Stack pb="xl" className={CONTENT_ENTER_CLASS} ref={containerRef}>
      {/* Desktop: full-size create button instead of the FAB (like the
          Calendar page's "New event" button); the FAB below is mobile-only.
          Rendered above the list so it is still available when empty. */}
      <Paper withBorder p="sm" visibleFrom="lg">
        <Group justify="flex-end" wrap="nowrap">
          <Button
            __vars={{ "--button-height": "43px" }}
            leftSection={<IconPlus size={16} />}
            onClick={openCreate}
          >
            Add department
          </Button>
        </Group>
      </Paper>

      {departments.length === 0 ? (
        <EmptyState
          icon={<IconSitemap size={18} />}
          description="No departments yet. Create one to start assigning users and sharing its calendar."
          actionLabel="Add department"
          onAction={openCreate}
        />
      ) : (
        <>
          {/* Mobile: card list — tap a card to open the details modal.
              Children are indented and name their parent on a second line.
              Reorder arrows sit at the card's left edge. */}
          <SortableList
            keys={displayRows.map(({ calendar }) => calendar.id)}
            onMove={(id, toIndex) => void moveTo(id, toIndex)}
          >
            <Stack gap="sm" hiddenFrom="lg" data-flip-container>
              {displayRows.map(({ calendar, depth, parent }, index) => (
                <SortableRow
                  key={calendar.id}
                  id={calendar.id}
                  index={index}
                  name={calendar.name}
                  enabled={dragEnabled}
                >
                  {({ ref, handle }) => (
                    <Paper
                      ref={ref}
                      withBorder
                      p="sm"
                      data-flip-id={calendar.id}
                      {...openRow(calendar)}
                    >
                      <Group justify="space-between" wrap="nowrap" align="center">
                        <Group
                          wrap="nowrap"
                          gap="sm"
                          align="center"
                          style={{ minWidth: 0, flex: 1 }}
                        >
                          {actionsFor(calendar, handle)}
                          <Box style={{ minWidth: 0 }}>
                            <Group wrap="nowrap" align="center" gap={6}>
                              <ColorDot color={calendar.color} />
                              <Text fw={600} truncate style={{ paddingLeft: depth * 12 }}>
                                {calendar.name}
                              </Text>
                            </Group>
                            {parent && (
                              <Text
                                size="xs"
                                c="dimmed"
                                truncate
                                style={{ paddingLeft: 12 + depth * 12 }}
                              >
                                In {parent.name}
                              </Text>
                            )}
                          </Box>
                        </Group>
                        <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
                          {formatColorLabel(calendar.color, calendar.id)}
                        </Text>
                      </Group>
                    </Paper>
                  )}
                </SortableRow>
              ))}
            </Stack>
          </SortableList>

          {/* Desktop: data table — tap a row to open the details modal.
              Hierarchy is carried by the indent depth + the Parent column. */}
          <SortableList
            keys={displayRows.map(({ calendar }) => calendar.id)}
            onMove={(id, toIndex) => void moveTo(id, toIndex)}
          >
            <Paper withBorder visibleFrom="lg" data-flip-container>
              <Table withRowBorders={false} highlightOnHover tabularNums>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Parent</Table.Th>
                    <Table.Th>External color</Table.Th>
                    <Table.Th ta="right">
                      <VisuallyHidden>Actions</VisuallyHidden>
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {displayRows.map(({ calendar, depth, parent }, index) => (
                    <SortableRow
                      key={calendar.id}
                      id={calendar.id}
                      index={index}
                      name={calendar.name}
                      enabled={dragEnabled}
                    >
                      {({ ref, handle }) => (
                        <Table.Tr ref={ref} data-flip-id={calendar.id} {...openRow(calendar)}>
                          <Table.Td>
                            <Text fw={600} style={{ paddingLeft: depth * 16 }}>
                              {calendar.name}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            {parent ? (
                              <Text size="sm" c="dimmed">
                                {parent.name}
                              </Text>
                            ) : (
                              <Text size="sm" c="dimmed">
                                —
                              </Text>
                            )}
                          </Table.Td>
                          <Table.Td>
                            <Group gap={6} wrap="nowrap">
                              <ColorDot color={calendar.color} />
                              <Text size="sm">{formatColorLabel(calendar.color, calendar.id)}</Text>
                            </Group>
                          </Table.Td>
                          <Table.Td>{actionsFor(calendar, handle)}</Table.Td>
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

      <DepartmentDetail
        calendar={selected}
        departments={departments}
        opened={detailOpened}
        onClose={closeDetail}
        onSaved={(calendar) => {
          setSelected(calendar);
        }}
        onCreate={() => {
          closeDetail();
          setSelected(null);
          refreshAfterSave();
        }}
        onRequestDelete={requestDelete}
      />

      <Modal opened={confirmOpened} onClose={closeConfirm} title="Delete department" centered>
        <Text>
          Delete &quot;{deleting?.name}&quot;? This removes the Google Calendar and unassigns its
          users.
          {deleting && deletingChildCount > 0 && (
            <>
              {" "}
              Its {deletingChildCount} sub-department{deletingChildCount > 1 ? "s" : ""} will become
              top level.
            </>
          )}
        </Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={closeConfirm}>
            Cancel
          </Button>
          <Button
            color="red"
            loading={deletingInProgress}
            loaderProps={BUTTON_LOADER_PROPS}
            onClick={confirmDelete}
          >
            Delete
          </Button>
        </Group>
      </Modal>

      {/* Mobile-only: at lg the "Add department" button in the toolbar replaces
          the FAB. hiddenFrom sits on the toolbar itself: its Affix portals to
          <body>, so a wrapper element could not hide it. */}
      <FloatingToolbar bottomOffset="var(--settings-fab-bottom)" hiddenFrom="lg">
        <FloatingActionButton aria-label="Add department" onClick={openCreate}>
          <IconPlus size={FAB_ICON_SIZE} />
        </FloatingActionButton>
      </FloatingToolbar>
    </Stack>
  );
}
