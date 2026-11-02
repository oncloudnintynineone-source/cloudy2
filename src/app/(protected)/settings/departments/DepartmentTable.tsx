"use client";

import { type KeyboardEvent, type ReactNode, useMemo, useState } from "react";
import { Box, Button, Group, Paper, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconSearchOff, IconSitemap } from "@tabler/icons-react";

import { EmptyState } from "@/components/EmptyState";
import { MotionModal } from "@/components/MotionModal";
import { useMotion } from "@/components/MotionProvider";
import { SettingsListChrome } from "@/components/SettingsListChrome";
import type { Calendar } from "@/db/schema";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import { fadeTransitionProps } from "@/lib/motion/transitions";
import { deleteDepartment, moveDepartment, reorderDepartments } from "@/lib/roster/actions";
import {
  buildDepartmentTree,
  departmentPathLabels,
  departmentTreeRows,
  moveAvailability,
  moveInTreeOrder,
  moveToSiblingIndex,
  type DepartmentTreeNode,
} from "@/lib/roster/hierarchy";
import { fuzzyFilter } from "@/lib/search/fuzzy";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import {
  isReorderArrowsEnabled,
  isReorderDragEnabled,
  type ReorderDrag,
} from "@/lib/settings/featureFlags";
import { useReorderRows } from "@/lib/ui/reorderRows";
import { formatColorLabel } from "@/lib/events/eventColors";
import { ColorDot } from "@/components/ColorSwatchPicker";
import { ReorderUpDown } from "@/components/reorderUpDown";
import { SortableList, SortableRow } from "@/components/SortableRow";
import { useActivityRefresh } from "@/components/ActivityBar";

// The dialog chrome is static and tiny; the heavy form/access body inside it
// is the lazy chunk (see DepartmentDetail.tsx), so the departments route stays
// small without the old whole-modal `dynamic` fallback.
import { DepartmentDetail } from "./DepartmentDetail";

interface DepartmentTableProps {
  departments: Calendar[];
  /** Reorder interaction (Settings → Feature Flags). */
  reorderDrag: ReorderDrag;
}

export function DepartmentTable({ departments, reorderDrag }: DepartmentTableProps) {
  const motion = useMotion();
  const refreshAfterSave = useActivityRefresh("departments:save");
  const dragEnabled = isReorderDragEnabled(reorderDrag);
  const arrowsEnabled = isReorderArrowsEnabled(reorderDrag);
  const [search, setSearch] = useState("");
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

  // Full ancestor path per department ("HQ › Logistics"), so searching a parent
  // also surfaces its descendants.
  const departmentLabels = useMemo(() => {
    const rows = departmentTreeRows(
      departments.map((department) => ({
        id: department.id,
        name: department.name,
        sortOrder: department.sortOrder ?? 0,
        parentId: department.parentId,
      })),
    );
    return departmentPathLabels(rows);
  }, [departments]);

  const isSearching = search.trim() !== "";
  const filteredRows = useMemo(
    () =>
      fuzzyFilter(displayRows, search, (row) => [
        row.calendar.name,
        departmentLabels.get(row.calendar.id) ?? "",
      ]),
    [displayRows, search, departmentLabels],
  );

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
        {arrowsEnabled && !isSearching && (
          <ReorderUpDown
            name={calendar.name}
            upDisabled={busy || !can.up}
            downDisabled={busy || !can.down}
            onUp={() => void reorderDepartment(calendar.id, -1)}
            onDown={() => void reorderDepartment(calendar.id, 1)}
          />
        )}
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
    <Stack
      ref={containerRef}
      gap="md"
      className={`${CONTENT_ENTER_CLASS} settings-pill-page-pad`}
    >
      <SettingsListChrome
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search departments by name or parent"
        searchAriaLabel="Search departments by name or parent"
        actions={[
          {
            label: "Add department",
            icon: <IconPlus size={18} />,
            onClick: openCreate,
            primary: true,
          },
        ]}
        paneRef={containerRef}
      />

      {departments.length === 0 ? (
        <EmptyState
          icon={<IconSitemap size={18} />}
          description="No departments yet. Create one to start assigning users and sharing its calendar."
          actionLabel="Add department"
          onAction={openCreate}
        />
      ) : filteredRows.length === 0 ? (
        <EmptyState
          icon={<IconSearchOff size={18} />}
          description="No departments match your search."
          actionLabel="Clear search"
          onAction={() => setSearch("")}
        />
      ) : (
        <SortableList
          keys={filteredRows.map(({ calendar }) => calendar.id)}
          onMove={(id, toIndex) => {
            // Reordering a filtered view would write indices that don't match
            // the full tree; the drag handle and arrows are hidden while
            // searching, so this only guards stale gestures.
            if (!isSearching) {
              void moveTo(id, toIndex);
            }
          }}
        >
          <Box component="div" className="card-grid" data-flip-container>
            {filteredRows.map(({ calendar, depth, parent }, index) => (
              <SortableRow
                key={calendar.id}
                id={calendar.id}
                index={index}
                name={calendar.name}
                enabled={dragEnabled && !isSearching}
              >
                {({ ref, handle }) => (
                  <Paper
                    ref={ref}
                    withBorder
                    p="sm"
                    data-flip-id={calendar.id}
                    className="c2-defer-render"
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
          </Box>
        </SortableList>
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

      <MotionModal
        opened={confirmOpened}
        onClose={closeConfirm}
        title="Delete department"
        centered
        transitionProps={fadeTransitionProps(motion)}
      >
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
      </MotionModal>
    </Stack>
  );
}
