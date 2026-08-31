"use client";

import { type KeyboardEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Modal,
  Paper,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconChevronDown, IconChevronUp, IconPlus, IconSitemap } from "@tabler/icons-react";

import { EmptyState } from "@/components/EmptyState";
import type { Calendar } from "@/db/schema";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import { deleteDepartment, moveDepartment } from "@/lib/roster/actions";
import {
  buildDepartmentTree,
  moveAvailability,
  type DepartmentTreeNode,
} from "@/lib/roster/hierarchy";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { FAB_ICON_SIZE, FloatingActionButton, FloatingToolbar } from "@/components/FloatingToolbar";
import { formatColorLabel } from "@/lib/events/eventColors";
import { ColorDot } from "@/components/ColorSwatchPicker";
import { DepartmentDetail } from "./DepartmentDetail";
import { invalidateCurrentPathCaches } from "@/lib/pwa/client";

interface DepartmentTableProps {
  departments: Calendar[];
}

export function DepartmentTable({ departments }: DepartmentTableProps) {
  const router = useRouter();
  const [detailOpened, { open: openDetail, close: closeDetail }] = useDisclosure(false);
  const [confirmOpened, { open: openConfirm, close: closeConfirm }] = useDisclosure(false);
  const [selected, setSelected] = useState<Calendar | null>(null);
  const [deleting, setDeleting] = useState<Calendar | null>(null);
  const [deletingInProgress, setDeletingInProgress] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);

  const deletingChildCount = deleting
    ? departments.filter((calendar) => calendar.parentId === deleting.id).length
    : 0;

  // Preorder display (parent, then its children, indented by depth) and each
  // row's move availability (a department only moves among its siblings).
  const displayRows = useMemo(() => {
    const byId = new Map(departments.map((calendar) => [calendar.id, calendar]));
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
    walk(buildDepartmentTree(departments), 0);
    return rows;
  }, [departments]);

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
        void invalidateCurrentPathCaches().then(() => router.refresh());
      } else {
        notifications.show({ color: "red", message: result.error });
      }
    } finally {
      setDeletingInProgress(false);
    }
  }

  async function move(calendar: Calendar, direction: "up" | "down") {
    const key = `${calendar.id}:${direction}`;
    if (moving) return;
    setMoving(key);
    try {
      const result = await moveDepartment(calendar.id, direction);
      if (result.ok) {
        void invalidateCurrentPathCaches().then(() => router.refresh());
      } else {
        notifications.show({ color: "red", message: result.error });
      }
    } finally {
      setMoving(null);
    }
  }

  function actionsFor(calendar: Calendar) {
    const can = availability.get(calendar.id) ?? { up: false, down: false };
    return (
      <Group gap={4} wrap="nowrap" onClick={(event) => event.stopPropagation()}>
        <Tooltip label="Move up" position="top">
          <ActionIcon
            variant="default"
            size="sm"
            aria-label={`Move ${calendar.name} up`}
            disabled={!can.up}
            loading={moving === `${calendar.id}:up`}
            loaderProps={BUTTON_LOADER_PROPS}
            onClick={() => move(calendar, "up")}
          >
            <IconChevronUp size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Move down" position="top">
          <ActionIcon
            variant="default"
            size="sm"
            aria-label={`Move ${calendar.name} down`}
            disabled={!can.down}
            loading={moving === `${calendar.id}:down`}
            loaderProps={BUTTON_LOADER_PROPS}
            onClick={() => move(calendar, "down")}
          >
            <IconChevronDown size={16} />
          </ActionIcon>
        </Tooltip>
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
    <Stack pb="xl" className={CONTENT_ENTER_CLASS}>
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
              Children are indented and name their parent on a second line. */}
          <Stack gap="sm" hiddenFrom="lg">
            {displayRows.map(({ calendar, depth, parent }) => (
              <Paper key={calendar.id} withBorder p="sm" {...openRow(calendar)}>
                <Group justify="space-between" wrap="nowrap" align="center">
                  <Box style={{ minWidth: 0 }}>
                    <Group wrap="nowrap" align="center" gap={6}>
                      <ColorDot color={calendar.color} />
                      <Text fw={600} truncate style={{ paddingLeft: depth * 12 }}>
                        {calendar.name}
                      </Text>
                    </Group>
                    {parent && (
                      <Text size="xs" c="dimmed" truncate style={{ paddingLeft: 12 + depth * 12 }}>
                        In {parent.name}
                      </Text>
                    )}
                  </Box>
                  <Group wrap="nowrap" gap="sm" align="center">
                    <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
                      {formatColorLabel(calendar.color, calendar.id)}
                    </Text>
                    {actionsFor(calendar)}
                  </Group>
                </Group>
              </Paper>
            ))}
          </Stack>

          {/* Desktop: data table — tap a row to open the details modal.
              Hierarchy is carried by the indent depth + the Parent column. */}
          <Paper withBorder visibleFrom="lg">
            <Table withRowBorders={false} highlightOnHover tabularNums>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Parent</Table.Th>
                  <Table.Th>External color</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {displayRows.map(({ calendar, depth, parent }) => (
                  <Table.Tr key={calendar.id} {...openRow(calendar)}>
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
                    <Table.Td>{actionsFor(calendar)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
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
          void invalidateCurrentPathCaches().then(() => router.refresh());
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
