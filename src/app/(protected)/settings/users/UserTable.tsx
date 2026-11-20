"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Badge, Box, Button, Group, Paper, Stack, Text, Tooltip } from "@mantine/core";
import { LazyModal } from "@/components/LazyModal";
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
import { grantSummaryLabel } from "@/lib/roster/accessEditor";
import { departmentPathLabels, departmentTreeRows } from "@/lib/roster/hierarchy";
import { fuzzyFilter } from "@/lib/search/fuzzy";
import { formatFullName } from "@/lib/settings/formatName";
import { DESKTOP_MEDIA_QUERY } from "@/lib/theme";
import { activatable } from "@/lib/ui/activatable";
import { useEntityEditor } from "@/lib/ui/useEntityEditor";
import dynamic from "next/dynamic";
import { FormModalSkeleton } from "@/components/FormModalSkeleton";
import { useChunkReady } from "@/lib/loading/chunkReady";
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
  const editor = useEntityEditor<RosterUser>();
  const [filterOpened, { open: openFilter, close: closeFilter }] = useDisclosure(false);
  const userFormReady = useChunkReady(loadUserForm, editor.opened);
  // Where the filter trigger sat on screen; the dialog grows out of / shrinks
  // back into it (see src/lib/motion/origin.ts).
  const [filterOriginRect, setFilterOriginRect] = useState<Rect | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState<string[]>([]);
  // The form lives in a lazy chunk and owns its `useForm`, so it reports whether
  // anything is staged; closing the dialog then asks before throwing it away.
  const dirtyRef = useRef(false);
  const [discardOpened, { open: openDiscard, close: closeDiscard }] = useDisclosure(false);
  const reportDirty = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);

  // Department id → full ancestor-path label ("HQ › Logistics"), shared by the
  // Department chip filter and the cards, so a nested department never reads as
  // a bare name in one place and a path in the other.
  const departmentLabels = useMemo(() => {
    const rows = departmentTreeRows(
      departments.map((department) => ({
        id: department.id,
        name: department.name,
        sortOrder: department.sortOrder ?? 0,
        parentId: department.parentId,
      })),
    );
    const labels = departmentPathLabels(rows);
    return new Map(rows.map((row) => [row.id, labels.get(row.id) ?? row.name]));
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
        options: [...departmentLabels].map(([value, label]) => ({ value, label })),
      },
    ],
    [departmentLabels],
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
    editor.openCreate();
  }

  function openEdit(user: RosterUser) {
    editor.openEdit(user);
  }

  /** The one exit path: closes the dialog and forgets the target. */
  function closeEditor() {
    dirtyRef.current = false;
    editor.closeEditor();
  }

  /** The X / backdrop / Esc path — staged edits are never dropped silently. */
  function requestEditorClose() {
    if (dirtyRef.current) {
      openDiscard();
      return;
    }
    closeEditor();
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
          {filtered.map((user) => {
            const grants = accessByUser[user.id] ?? [];
            // The template line only says something when the recipe actually
            // changes the name — the default "{name}" template would just
            // repeat the bold line above it.
            const templateName = formatFullName(
              { name: user.name, departmentName: user.department?.name ?? null },
              nameTemplate,
            );
            const departmentLabel = user.department
              ? (departmentLabels.get(user.department.id) ?? user.department.name)
              : null;
            // Same labels as the department chip: a nested department reads as a
            // path in the tooltip too, and a since-deleted one falls back to the
            // name the server carried on the grant.
            const grantNames = grants.map(
              (grant) => departmentLabels.get(grant.calendarId) ?? grant.name,
            );
            return (
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
                    {templateName !== user.name ? (
                      <Text size="sm" c="dimmed">
                        {templateName}
                      </Text>
                    ) : null}
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
                  {departmentLabel ? (
                    <Badge variant="light" color="accent">
                      {departmentLabel}
                    </Badge>
                  ) : (
                    <Badge variant="outline" color="gray">
                      No department
                    </Badge>
                  )}
                  {/* Cross-department grants are otherwise invisible until the
                      card is opened. */}
                  {grants.length > 0 ? (
                    <Tooltip
                      label={grantNames.join(", ")}
                      multiline
                      maw={240}
                      withArrow
                    >
                      <Badge
                        variant="outline"
                        color="gray"
                        aria-label={`Also has access to ${grantNames.join(", ")}`}
                      >
                        +{grantSummaryLabel(grants.length)}
                      </Badge>
                    </Tooltip>
                  ) : null}
                </Group>
              </Paper>
            );
          })}
        </Box>
      )}

      <LazyModal
        opened={editor.opened}
        onClose={requestEditorClose}
        title={editor.editing ? "Edit user" : "Add user"}
        size={isDesktop ? "lg" : "md"}
        ready={userFormReady}
        skeleton={<FormModalSkeleton rows={7} />}
      >
        <UserForm
          key={editor.editing?.id ?? "new"}
          user={editor.editing}
          departments={departments}
          access={editor.editing ? (accessByUser[editor.editing.id] ?? []) : []}
          onDirtyChange={reportDirty}
          onDone={() => {
            closeEditor();
            refreshAfterSave();
          }}
        />
      </LazyModal>

      <MotionModal
        opened={discardOpened}
        onClose={closeDiscard}
        title="Discard changes?"
        centered
        size="sm"
        withCloseButton={false}
        zIndex={400}
      >
        <Text size="sm">
          Your unsaved changes to this user will be lost. This cannot be undone.
        </Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={closeDiscard}>
            Keep editing
          </Button>
          <Button
            color="red"
            onClick={() => {
              closeDiscard();
              closeEditor();
            }}
          >
            Discard changes
          </Button>
        </Group>
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
