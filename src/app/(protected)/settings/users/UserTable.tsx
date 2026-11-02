"use client";

import { useMemo, useRef, useState } from "react";
import { Badge, Box, Group, Paper, Stack, Text } from "@mantine/core";
import { MotionModal } from "@/components/MotionModal";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { IconPlus, IconSearchOff, IconUsers } from "@tabler/icons-react";

import { EmptyState } from "@/components/EmptyState";
import { useActivityRefresh } from "@/components/ActivityBar";
import { FilterModal, type FilterGroup } from "@/components/FilterModal";
import { SettingsListChrome } from "@/components/SettingsListChrome";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import { type Rect } from "@/lib/motion/origin";
import type { RosterAccessGrant, RosterUser } from "@/lib/roster/queries";
import { departmentPathLabels, departmentTreeRows } from "@/lib/roster/hierarchy";
import { fuzzyFilter } from "@/lib/search/fuzzy";
import { formatFullName } from "@/lib/settings/formatName";
import { DESKTOP_MEDIA_QUERY } from "@/lib/theme";
import { activatable } from "@/lib/ui/activatable";
import dynamic from "next/dynamic";
import { CrossfadeSwap } from "@/components/CrossfadeSwap";
import { FormModalSkeleton } from "@/components/FormModalSkeleton";
import { useChunkReady } from "@/lib/loading/chunkReady";
import { MIN_SKELETON_HOLD_MS } from "@/lib/loading/minHoldLoading";
import type { DepartmentOption } from "./UserForm";

// The edit-user form is large (roster fields, department access, pickers) and
// only mounted on tap; split it out of the users route's initial chunk. The
// chunk reveal dissolves through `CrossfadeSwap` (gated on `useChunkReady`)
// instead of `dynamic`'s hard-cut fallback, so the skeleton and the form share
// one modal body.
const loadUserForm = () => import("./UserForm").then((mod) => mod.UserForm);
const UserForm = dynamic(loadUserForm, { ssr: false, loading: () => null });

interface UserTableProps {
  users: RosterUser[];
  departments: DepartmentOption[];
  /** Cross-department grants grouped by user id (empty for a fresh user). */
  accessByUser: Record<string, RosterAccessGrant[]>;
  nameTemplate: string;
}

export function UserTable({ users, departments, accessByUser, nameTemplate }: UserTableProps) {
  const refreshAfterSave = useActivityRefresh("users:save");
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);
  const paneRef = useRef<HTMLDivElement>(null);
  const [opened, { open, close }] = useDisclosure(false);
  const [filterOpened, { open: openFilter, close: closeFilter }] = useDisclosure(false);
  const userFormReady = useChunkReady(loadUserForm, opened);
  // Where the filter trigger sat on screen; the dialog grows out of / shrinks
  // back into it (see src/lib/motion/origin.ts).
  const [filterOriginRect, setFilterOriginRect] = useState<Rect | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState<string[]>([]);
  const [editingUser, setEditingUser] = useState<RosterUser | null>(null);

  // Department rows (preorder + full ancestor-path labels) for the Department
  // chip filter — children read as "HQ › Logistics" inside the chip itself.
  const departmentOptions = useMemo(() => {
    const rows = departmentTreeRows(
      departments.map((department) => ({
        id: department.id,
        name: department.name,
        sortOrder: department.sortOrder ?? 0,
        parentId: department.parentId,
      })),
    );
    const labels = departmentPathLabels(rows);
    return rows.map((row) => ({ value: row.id, label: labels.get(row.id) ?? row.name }));
  }, [departments]);

  const filterGroups: FilterGroup[] = useMemo(
    () => [
      {
        label: "Status",
        options: [
          { value: "active", label: "Active" },
          { value: "inactive", label: "Inactive" },
        ],
      },
      {
        label: "Department",
        options: departmentOptions,
      },
    ],
    [departmentOptions],
  );

  const filterValues: Record<string, string[]> = useMemo(
    () => ({ Status: statusFilter, Department: departmentFilter }),
    [statusFilter, departmentFilter],
  );

  const activeFilterCount = Object.values(filterValues).filter(
    (values) => values.length > 0,
  ).length;

  const filtered = useMemo(() => {
    const byFilter = users.filter((user) => {
      if (statusFilter.length > 0 && !statusFilter.includes(user.status)) {
        return false;
      }
      if (
        departmentFilter.length > 0 &&
        (!user.department?.id || !departmentFilter.includes(user.department.id))
      ) {
        return false;
      }
      return true;
    });
    return fuzzyFilter(byFilter, search, (user) => [
      user.name,
      user.shortname,
      { value: user.phone, fuzzy: false },
    ]);
  }, [users, search, statusFilter, departmentFilter]);

  const isNarrowed = search.trim() !== "" || activeFilterCount > 0;

  function handleApplyFilters(values: Record<string, string[]>) {
    setStatusFilter(values.Status ?? []);
    setDepartmentFilter(values.Department ?? []);
  }

  function clearAllFilters() {
    setStatusFilter([]);
    setDepartmentFilter([]);
  }

  function clearSearchAndFilters() {
    setSearch("");
    clearAllFilters();
  }

  function openCreate() {
    setEditingUser(null);
    open();
  }

  function openEdit(user: RosterUser) {
    setEditingUser(user);
    open();
  }

  return (
    <Stack ref={paneRef} gap="md" className={`${CONTENT_ENTER_CLASS} settings-pill-page-pad`}>
      <SettingsListChrome
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, shortname, or phone"
        searchAriaLabel="Search users by name, shortname, or phone"
        filter={{
          activeCount: activeFilterCount,
          onClick: (event) => {
            setFilterOriginRect(event.currentTarget.getBoundingClientRect());
            openFilter();
          },
        }}
        actions={[
          {
            label: "Add user",
            icon: <IconPlus size={18} />,
            onClick: openCreate,
            primary: true,
          },
        ]}
        paneRef={paneRef}
      />

      {filtered.length === 0 ? (
        isNarrowed ? (
          <EmptyState
            icon={<IconSearchOff size={18} />}
            description="No users match your search or filters."
            actionLabel="Clear search & filters"
            onAction={clearSearchAndFilters}
          />
        ) : (
          <EmptyState
            icon={<IconUsers size={18} />}
            description="No users yet."
            actionLabel="Add user"
            onAction={openCreate}
          />
        )
      ) : (
        <Box component="div" className="card-grid">
          {filtered.map((user) => (
            <Paper
              key={user.id}
              withBorder
              p="sm"
              className="c2-defer-render"
              onClick={() => openEdit(user)}
              {...activatable(() => openEdit(user))}
              style={{ cursor: "pointer" }}
            >
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Stack gap={0}>
                  <Text fw={600}>{user.name}</Text>
                  <Text size="sm" c="dimmed">
                    {formatFullName(
                      { name: user.name, departmentName: user.department?.name ?? null },
                      nameTemplate,
                    )}
                  </Text>
                </Stack>
                <Badge color={user.status === "active" ? "green" : "gray"}>
                  {user.status === "active" ? "Active" : "Inactive"}
                </Badge>
              </Group>
              <Group gap={6} wrap="wrap" mt={4}>
                {user.shortname ? (
                  <Badge variant="light" color="accent">
                    {user.shortname}
                  </Badge>
                ) : null}
                <Text size="sm" c="dimmed">
                  {user.phone}
                </Text>
                <Badge color={user.role === "admin" ? "brand" : "gray"}>
                  {user.role === "admin" ? "Admin" : "User"}
                </Badge>
                {user.department ? (
                  <Badge variant="light" color="accent">
                    {user.department.name}
                  </Badge>
                ) : (
                  <Badge variant="outline" color="gray">
                    No department
                  </Badge>
                )}
              </Group>
            </Paper>
          ))}
        </Box>
      )}

      <MotionModal
        opened={opened}
        onClose={close}
        title={editingUser ? "Edit user" : "Add user"}
        centered
        size={isDesktop ? "lg" : "md"}
      >
        <CrossfadeSwap
          loading={opened && !userFormReady}
          minHoldMs={MIN_SKELETON_HOLD_MS}
          mode="overlay"
          skeleton={<FormModalSkeleton rows={5} />}
        >
          <UserForm
            key={editingUser?.id ?? "new"}
            user={editingUser}
            departments={departments}
            access={editingUser ? (accessByUser[editingUser.id] ?? []) : []}
            onDone={() => {
              close();
              setEditingUser(null);
              refreshAfterSave();
            }}
          />
        </CrossfadeSwap>
      </MotionModal>

      <FilterModal
        opened={filterOpened}
        onClose={closeFilter}
        title="Filters"
        groups={filterGroups}
        values={filterValues}
        onApply={handleApplyFilters}
        originRect={filterOriginRect}
      />
    </Stack>
  );
}
