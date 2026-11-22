"use client";

import "@mantine/dates/styles.css";
import { useCallback, useMemo, useState, useTransition } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Menu,
  Pagination,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
  useMantineTheme,
  VisuallyHidden,
} from "@mantine/core";
import { ConfirmModal } from "@/components/ConfirmModal";
import { MotionModal } from "@/components/MotionModal";
import { DatePickerInput } from "@mantine/dates";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconDownload, IconFilter, IconFilterOff, IconTrash, IconX } from "@tabler/icons-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AuditDetails } from "@/components/AuditDetails";
import { CrossfadeSwap } from "@/components/CrossfadeSwap";
import { EmptyState } from "@/components/EmptyState";
import { FilterButton } from "@/components/FilterButton";
import { FilterModal, type FilterGroup } from "@/components/FilterModal";
import { FAB_ICON_SIZE, FloatingActionButton, FloatingToolbar } from "@/components/FloatingToolbar";
import { LoadingStatus } from "@/components/LoadingStatus";
import { PickerBadges, type PickerBadgeItem } from "@/components/PickerField";
import { useColdStartContent } from "@/components/ColdStartReady";
import { purgeAuditLogs } from "@/lib/audit/actions";
import { listAuditActions } from "@/lib/audit/build";
import { actionLabel, actorLabel, formatLogTimestamp } from "@/lib/audit/format";
import { relativeChangeLabel } from "@/lib/events/changeTrail";
import type { AuditFilters } from "@/lib/audit/queries";
import { useLiveRouteRefresh } from "@/lib/loading/liveRefresh";
import { type Rect } from "@/lib/motion/origin";
import { useMotion } from "@/components/MotionProvider";
import { useMinSkeletonHold } from "@/lib/loading/minHoldLoading";
import type { AuditLog } from "@/db/schema";

import { useActivityRefresh, useReportActivity } from "@/components/ActivityBar";
import { AuditLogRowSkeleton } from "./AuditLogRowSkeleton";
import { SettingsTableSkeleton } from "@/components/SettingsTableSkeleton";

interface AuditLogViewProps {
  initialRows: AuditLog[];
  /** 1-based current page (clamped to `pageCount`). */
  page: number;
  /** Total number of pages for the current filters. */
  pageCount: number;
  /** Total number of matching entries across all pages. */
  total: number;
  filters: AuditFilters;
  /** Distinct actor names seen in the log, plus any name in the applied filter. */
  actors: string[];
  /** Actor name → roster department (null name for "Admin"/deleted users). */
  actorDepartments: Record<
    string,
    {
      department: string | null;
      departmentSort: number | null;
      departmentId: string | null;
      departmentParentId: string | null;
    }
  >;
  entityTypes: string[];
  retentionDays: number;
  /** Server render time (epoch ms) — gates the always-fresh live re-read. */
  renderedAt: number;
}

function dateToInput(date: Date | string | null): string | null {
  if (date === null) {
    return null;
  }
  if (typeof date === "string") {
    return date;
  }
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function inputToDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function AuditLogView({
  initialRows,
  page,
  pageCount,
  total,
  filters,
  actors,
  actorDepartments,
  entityTypes,
  retentionDays,
  renderedAt,
}: AuditLogViewProps) {
  const motion = useMotion();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const [isPending, startTransition] = useTransition();
  // The global activity bar mirrors the audit filter transitions and the
  // post-delete refresh.
  useReportActivity(isPending, "audit:filter");
  const refreshAfterDelete = useActivityRefresh("audit:save");

  // Skeleton-only loading: filter changes (URL transitions) show a row-card
  // skeleton with a minimum ~350ms hold, then the list fades in on the reveal.
  // The always-fresh live re-read — triggered when the payload is a cache
  // replay, or by the header Force refresh's soft path — shares the skeleton, so
  // stale rows never paint.
  const liveRefreshing = useLiveRouteRefresh(renderedAt);
  const listLoading = useMinSkeletonHold(isPending || liveRefreshing);
  // Cold-start readiness: mounts with the route's first (server-rendered) page
  // of rows, so reporting on mount is exactly "content painted".
  useColdStartContent();

  const [searchInput, setSearchInput] = useState(filters.query ?? "");

  const [detail, setDetail] = useState<AuditLog | null>(null);
  const [purgeOpened, { open: openPurge, close: closePurge }] = useDisclosure(false);
  const [exportOpened, { open: openExport, close: closeExport }] = useDisclosure(false);
  const [filtersOpened, { open: openFilters, close: closeFilters }] = useDisclosure(false);
  // Where the filter trigger sat on screen; the dialog grows out of / shrinks
  // back into it (see src/lib/motion/origin.ts).
  const [filtersOriginRect, setFiltersOriginRect] = useState<Rect | null>(null);
  const [purging, setPurging] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Multi-value filter groups (Actors/Actions/Entity types), all using the
  // shared badge-dialog picker ("search" variant, empty = no filter). Actors
  // get per-department sections via the roster lookup; names with no roster
  // match ("Admin", deleted users) share an "Other" section.
  const filterGroups: FilterGroup[] = useMemo(
    () => [
      {
        label: "Actors",
        variant: "search",
        options: actors.map((name) => {
          const lookup = actorDepartments[name];
          return {
            value: name,
            label: name,
            department: lookup?.department ?? "Other",
            departmentSort: lookup?.departmentSort ?? null,
            departmentId: lookup?.departmentId ?? null,
            departmentParentId: lookup?.departmentParentId ?? null,
          };
        }),
      },
      {
        label: "Actions",
        variant: "search",
        options: listAuditActions().map((action) => ({
          value: action,
          label: actionLabel(action),
          search: action,
        })),
      },
      {
        label: "Entity types",
        variant: "search",
        options: entityTypes.map((entity) => ({ value: entity, label: entity })),
      },
    ],
    [actors, actorDepartments, entityTypes],
  );

  const filterValues: Record<string, string[]> = useMemo(
    () => ({
      Actors: filters.actor,
      Actions: filters.action,
      "Entity types": filters.entityType,
    }),
    [filters.actor, filters.action, filters.entityType],
  );

  const buildHref = useCallback(
    (updates: Record<string, string | null>, options?: { resetPage?: boolean }) => {
      const params = new URLSearchParams(searchParams.toString());
      // Any filter change resets pagination to the first page; page navigation
      // opts out so it can set `page` itself.
      if (options?.resetPage !== false) {
        params.delete("page");
      }
      params.delete("cursor");
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      const query = params.toString();
      return query ? `${pathname}?${query}` : pathname;
    },
    [searchParams, pathname],
  );

  const navigate = useCallback(
    (updates: Record<string, string | null>, options?: { resetPage?: boolean }) => {
      const query = searchParams.toString();
      const next = buildHref(updates, options);
      // A no-op navigation (picking the filter value already applied) would
      // still run a transition, flashing the list skeleton for nothing.
      if (next === (query ? `${pathname}?${query}` : pathname)) {
        return;
      }
      startTransition(() => {
        router.push(next);
      });
    },
    [buildHref, router, startTransition, pathname, searchParams],
  );

  const goToPage = useCallback(
    (nextPage: number) => {
      navigate({ page: nextPage <= 1 ? null : String(nextPage) }, { resetPage: false });
    },
    [navigate],
  );

  const applyFilters = useCallback(
    (updates: Record<string, string | null>) => {
      navigate(updates);
    },
    [navigate],
  );

  function handleApplyFilters(values: Record<string, string[]>) {
    const nextActors = values["Actors"] ?? [];
    const nextActions = values["Actions"] ?? [];
    const nextEntities = values["Entity types"] ?? [];
    applyFilters({
      actor: nextActors.length > 0 ? nextActors.join(",") : null,
      action: nextActions.length > 0 ? nextActions.join(",") : null,
      entity: nextEntities.length > 0 ? nextEntities.join(",") : null,
    });
  }

  // Per-chip removal mirrors the parade-state filters: drop one value from the
  // applied filter and navigate with the remainder (empty → param removed).
  function removeFilterValue(field: "actor" | "action" | "entity", value: string) {
    const list =
      field === "actor" ? filters.actor : field === "action" ? filters.action : filters.entityType;
    const next = list.filter((entry) => entry !== value);
    applyFilters({ [field]: next.length > 0 ? next.join(",") : null });
  }

  // One removable chip per applied value (the shared removable-chip recipe,
  // docs/user-picker.md §1.7), so the active filters stay visible without
  // reopening the dialog. The key carries the URL param the ✕ has to rewrite:
  // `<field>:<value>` for the multi-value filters, a bare param for the rest.
  const appliedFilterChips = useMemo<PickerBadgeItem[]>(
    () => [
      ...filters.actor.map((name) => ({ key: `actor:${name}`, label: name })),
      ...filters.action.map((action) => ({ key: `action:${action}`, label: actionLabel(action) })),
      ...filters.entityType.map((entity) => ({ key: `entity:${entity}`, label: entity })),
      ...(filters.query ? [{ key: "q", label: `Search: ${filters.query}` }] : []),
      ...(filters.from ? [{ key: "from", label: `From ${filters.from}` }] : []),
      ...(filters.to ? [{ key: "to", label: `To ${filters.to}` }] : []),
    ],
    [filters],
  );

  function removeAppliedFilterChip(item: PickerBadgeItem) {
    if (item.key === "q") {
      setSearchInput("");
      applyFilters({ q: null });
      return;
    }
    if (item.key === "from") {
      applyFilters({ from: null });
      return;
    }
    if (item.key === "to") {
      applyFilters({ to: null });
      return;
    }
    // Split on the first colon only: a value may contain one itself.
    const separator = item.key.indexOf(":");
    removeFilterValue(
      item.key.slice(0, separator) as "actor" | "action" | "entity",
      item.key.slice(separator + 1),
    );
  }

  const resetFilters = () => {
    setSearchInput("");
    navigate({ actor: null, action: null, entity: null, from: null, to: null, q: null });
  };

  const activeFilterCount =
    (filters.actor.length > 0 ? 1 : 0) +
    (filters.action.length > 0 ? 1 : 0) +
    (filters.entityType.length > 0 ? 1 : 0) +
    (filters.from ? 1 : 0) +
    (filters.to ? 1 : 0) +
    (filters.query ? 1 : 0);

  const exportUrl = useMemo(() => {
    const params = new URLSearchParams();
    const put = (key: string, value: string | null) => {
      if (value) {
        params.set(key, value);
      }
    };
    put("actor", filters.actor.join(","));
    put("action", filters.action.join(","));
    put("entity", filters.entityType.join(","));
    put("q", filters.query);
    put("from", filters.from);
    put("to", filters.to);
    const query = params.toString();
    return query ? `/api/audit/export?${query}` : "/api/audit/export";
  }, [filters]);

  const handlePurge = async () => {
    if (purging) {
      return;
    }
    setPurging(true);
    try {
      const result = await purgeAuditLogs(retentionDays);
      if (result.ok) {
        notifications.show({
          color: "green",
          message:
            result.deleted === 0
              ? "No entries older than the retention period"
              : `Deleted ${result.deleted} old log entr${result.deleted === 1 ? "y" : "ies"}`,
        });
        closePurge();
        refreshAfterDelete();
      } else {
        notifications.show({ color: "red", message: result.error });
      }
    } finally {
      setPurging(false);
    }
  };

  // Fetch the CSV as a blob (like contacts' VCF export) so the confirm
  // button can show real progress and failures surface as a toast instead
  // of a navigation to an error page.
  const handleExport = async () => {
    if (exporting) {
      return;
    }
    setExporting(true);
    try {
      const response = await fetch(exportUrl);
      if (!response.ok) {
        throw new Error(`Export failed with status ${response.status}`);
      }
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "audit-log.csv";
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      closeExport();
    } catch (error) {
      console.error("[audit] CSV export failed", error);
      notifications.show({ color: "red", message: "Could not export the audit log" });
    } finally {
      setExporting(false);
    }
  };

  // Relative timestamps (docs/ui-ux-improvements.md C5): in a log you scan
  // for "what just happened", so the age leads and the absolute UTC+8 stamp
  // rides as the secondary line. The age is computed once per render — this
  // is the always-fresh route (fresh on entry and on Force refresh,
  // docs/audit-log.md), and the label reflects the moment the page rendered;
  // it is not a live countdown and implies no polling that doesn't exist.
  const now = new Date();

  return (
    <Stack pb="xl">
      {isDesktop ? (
        // Desktop: search + dates live inline; the multi-value filters
        // (Actors/Actions/Entity types) open from a shared filter dialog, like
        // the dashboard and parade state.
        <Group align="flex-end" gap="xs" wrap="wrap">
          <form
            style={{ flex: 1, minWidth: 200 }}
            onSubmit={(event) => {
              event.preventDefault();
              applyFilters({ q: searchInput.trim() || null });
            }}
          >
            <TextInput
              aria-label="Search the audit log"
              placeholder="Search actor, entity, route…"
              value={searchInput}
              onChange={(event) => setSearchInput(event.currentTarget.value)}
              rightSection={
                searchInput ? (
                  <ActionIcon
                    variant="subtle"
                    onClick={() => setSearchInput("")}
                    aria-label="Clear search"
                  >
                    <IconX size={16} />
                  </ActionIcon>
                ) : null
              }
            />
          </form>
          <FilterButton
            activeCount={activeFilterCount}
            onClick={(e) => {
              setFiltersOriginRect(e.currentTarget.getBoundingClientRect());
              openFilters();
            }}
          />
          <DatePickerInput
            label="From"
            value={inputToDate(filters.from)}
            onChange={(date) => applyFilters({ from: dateToInput(date) })}
            clearable
            w={150}
          />
          <DatePickerInput
            label="To"
            value={inputToDate(filters.to)}
            onChange={(date) => applyFilters({ to: dateToInput(date) })}
            clearable
            w={150}
          />
          {activeFilterCount > 0 ? (
            <Button
              variant="subtle"
              size="xs"
              onClick={resetFilters}
              leftSection={<IconX size={14} />}
            >
              Reset filters
            </Button>
          ) : null}
          {/* Desktop export entry point; the FAB below is mobile-only. */}
          <Button
            __vars={{ "--button-height": "43px" }}
            leftSection={<IconDownload size={16} />}
            onClick={openExport}
          >
            Export
          </Button>
        </Group>
      ) : (
        <Group align="center" gap="xs" wrap="nowrap">
          <form
            style={{ flex: 1, minWidth: 0 }}
            onSubmit={(event) => {
              event.preventDefault();
              applyFilters({ q: searchInput.trim() || null });
            }}
          >
            <TextInput
              aria-label="Search the audit log"
              placeholder="Search actor, entity, route…"
              value={searchInput}
              onChange={(event) => setSearchInput(event.currentTarget.value)}
              rightSection={
                searchInput ? (
                  <ActionIcon
                    variant="subtle"
                    onClick={() => setSearchInput("")}
                    aria-label="Clear search"
                  >
                    <IconX size={16} />
                  </ActionIcon>
                ) : null
              }
            />
          </form>
          <Menu
            shadow="md"
            width={300}
            position="bottom-end"
            closeOnClickOutside={false}
            transitionProps={{
              transition: "pop-top-right",
              duration: motion.duration.popover,
              timingFunction: motion.easing.out,
            }}
          >
            <Menu.Target>
              <Box pos="relative">
                {/* Icon matches the label: a filter glyph, not the kebab used
                    for row/overflow actions elsewhere. */}
                <ActionIcon size={43} variant="default" aria-label="Filter log">
                  <IconFilter size={18} />
                </ActionIcon>
                {activeFilterCount > 0 && (
                  <Badge
                    size="sm"
                    variant="filled"
                    radius="xl"
                    pos="absolute"
                    style={{ top: -4, right: -4 }}
                  >
                    {activeFilterCount}
                  </Badge>
                )}
              </Box>
            </Menu.Target>
            <Menu.Dropdown>
              {/* Dates stay as quick inline pickers; the multi-value groups
                  open in the shared filter dialog ("empty = no filter"). */}
              <Stack gap="sm" p="xs">
                <Group grow align="flex-end" wrap="wrap">
                  <DatePickerInput
                    label="From"
                    value={inputToDate(filters.from)}
                    onChange={(date) => applyFilters({ from: dateToInput(date) })}
                    clearable
                  />
                  <DatePickerInput
                    label="To"
                    value={inputToDate(filters.to)}
                    onChange={(date) => applyFilters({ to: dateToInput(date) })}
                    clearable
                  />
                </Group>
              </Stack>
              <Menu.Divider />
              <Menu.Item
                leftSection={<IconFilter size={16} />}
                onClick={(e) => {
                  setFiltersOriginRect(e.currentTarget.getBoundingClientRect());
                  openFilters();
                }}
                rightSection={
                  activeFilterCount > 0 ? (
                    <Badge size="sm" variant="filled" radius="xl">
                      {activeFilterCount}
                    </Badge>
                  ) : null
                }
              >
                More filters…
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      )}

      {/* Applied-filter chips: one removable chip per selected value, so the
          active filters stay visible without reopening the dialog. These are the
          app's shared removable chips (docs/user-picker.md §1.7) — the same ✕
          inside the chip the wizard and the filter dialog use — and the values
          are free text (dates, action ids, search terms), so they keep their
          natural case. Renders nothing when no filter is applied. */}
      <PickerBadges items={appliedFilterChips} tt="none" onRemove={removeAppliedFilterChip} />

      <Stack gap="sm">
        <CrossfadeSwap
          loading={listLoading}
          mode="overlay"
          skeleton={
            <>
              <LoadingStatus label="Loading audit log" />
              {/* Mobile: card list */}
              <Stack gap="sm" hiddenFrom="lg">
                {Array.from({ length: 5 }).map((_, i) => (
                  <AuditLogRowSkeleton key={i} />
                ))}
              </Stack>

              {/* Desktop: data table (Time / Actor / Action / Entity / Route / Details) */}
              <SettingsTableSkeleton columns={[1, 1.6, 2.4, 2.4, 1.1]} rows={5} visibleFrom="lg" />
            </>
          }
        >
          {listLoading ? null : initialRows.length === 0 ? (
            <EmptyState
              icon={<IconFilterOff size={18} />}
              description="No log entries match these filters."
              actionLabel="Clear filters"
              onAction={resetFilters}
            />
          ) : (
            <>
              {/* Mobile: card list */}
              <Stack gap="sm" hiddenFrom="lg">
                {initialRows.map((row) => (
                  <Paper key={row.id} withBorder p="sm">
                    <Stack gap={4}>
                      <Group justify="space-between" wrap="nowrap" align="flex-start">
                        <Text fw={600} size="sm">
                          {actionLabel(row.action)}
                        </Text>
                        <Stack gap={0} align="flex-end">
                          <Text size="xs" fw={600} style={{ whiteSpace: "nowrap" }}>
                            {relativeChangeLabel(row.createdAt, now)}
                          </Text>
                          <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                            {formatLogTimestamp(row.createdAt)}
                          </Text>
                        </Stack>
                      </Group>
                      <Group gap={6} wrap="wrap">
                        <Text size="sm" c="dimmed">
                          {actorLabel(row)}
                        </Text>
                        {row.entityType ? (
                          <Badge size="xs" variant="light" color="brand">
                            {row.entityType}
                          </Badge>
                        ) : null}
                      </Group>
                      {row.entityName ? (
                        <Text size="sm" truncate>
                          {row.entityName}
                        </Text>
                      ) : null}
                      <Group gap={6} wrap="wrap">
                        {row.route ? (
                          <Badge size="xs" variant="outline" color="gray">
                            {row.route}
                          </Badge>
                        ) : null}
                        {row.method ? (
                          <Badge size="xs" variant="outline" color="gray">
                            {row.method}
                          </Badge>
                        ) : null}
                        <Button
                          variant="subtle"
                          size="compact-xs"
                          onClick={() => setDetail(row)}
                          style={{ marginLeft: "auto" }}
                        >
                          Details
                        </Button>
                      </Group>
                    </Stack>
                  </Paper>
                ))}
              </Stack>

              {/* Desktop: data table. A fixed layout pins Time/Actor/Details so
                the table never outgrows its container, while Action and Entity
                share the remaining width. Time and Actor stack their secondary
                value on a second line (time under date, role under name) to
                reclaim width, so no column is squeezed into an ellipsis at
                narrow desktop widths. Route/method are omitted here — they live
                in the detail modal and remain searchable/exportable. */}
              <Paper withBorder visibleFrom="lg">
                <Table withRowBorders={false} highlightOnHover tabularNums layout="fixed">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th w={110}>Time</Table.Th>
                      <Table.Th w={160}>Actor</Table.Th>
                      <Table.Th>Action</Table.Th>
                      <Table.Th>Entity</Table.Th>
                      <Table.Th ta="right" w={100}>
                        <VisuallyHidden>Details</VisuallyHidden>
                      </Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {initialRows.map((row) => {
                      const [datePart, timePart] = formatLogTimestamp(row.createdAt).split(" ");
                      return (
                        <Table.Tr key={row.id}>
                          <Table.Td>
                            <Stack gap={0}>
                              <Text size="sm" fw={600} style={{ whiteSpace: "nowrap" }}>
                                {relativeChangeLabel(row.createdAt, now)}
                              </Text>
                              <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                                {datePart}
                              </Text>
                              <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                                {timePart}
                              </Text>
                            </Stack>
                          </Table.Td>
                          <Table.Td>
                            <Stack gap={0}>
                              <Text size="sm" truncate title={actorLabel(row)}>
                                {row.actorName ?? "Unknown"}
                              </Text>
                              {row.actorRole ? (
                                <Text size="xs" c="dimmed">
                                  {row.actorRole}
                                </Text>
                              ) : null}
                            </Stack>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm" fw={600} truncate title={actionLabel(row.action)}>
                              {actionLabel(row.action)}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            {row.entityType || row.entityName ? (
                              <Group gap={6} wrap="nowrap">
                                {row.entityType ? (
                                  <Badge size="xs" variant="light" color="brand">
                                    {row.entityType}
                                  </Badge>
                                ) : null}
                                {row.entityName ? (
                                  <Text size="sm" c="dimmed" truncate title={row.entityName}>
                                    {row.entityName}
                                  </Text>
                                ) : null}
                              </Group>
                            ) : (
                              <Text size="sm" c="dimmed">
                                —
                              </Text>
                            )}
                          </Table.Td>
                          <Table.Td ta="right">
                            <Button variant="subtle" size="xs" onClick={() => setDetail(row)}>
                              Details
                            </Button>
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </Paper>
            </>
          )}
        </CrossfadeSwap>

        {!listLoading && initialRows.length > 0 ? (
          <Stack gap={4} align="center" mt="xs">
            {pageCount > 1 ? (
              <Pagination
                total={pageCount}
                value={page}
                onChange={goToPage}
                siblings={1}
                boundaries={1}
                withEdges
              />
            ) : null}
            <Text size="xs" c="dimmed">
              Page {page} of {pageCount} · {total.toLocaleString()}{" "}
              {total === 1 ? "entry" : "entries"}
            </Text>
          </Stack>
        ) : null}
      </Stack>

      <Paper withBorder p="sm">
        <Stack gap={2}>
          <Text size="sm" fw={600}>
            Retention
          </Text>
          <Text size="xs" c="dimmed">
            Entries older than {retentionDays} days are purged automatically when this page is
            viewed. You can also delete them now.
          </Text>
          <Group justify="flex-end" mt={4}>
            <Button
              variant="light"
              color="red"
              size="xs"
              leftSection={<IconTrash size={14} />}
              onClick={openPurge}
            >
              Delete older than {retentionDays} days
            </Button>
          </Group>
        </Stack>
      </Paper>

      <LogDetailModal row={detail} onClose={() => setDetail(null)} />

      <FilterModal
        opened={filtersOpened}
        onClose={closeFilters}
        title="Filters"
        groups={filterGroups}
        values={filterValues}
        onApply={handleApplyFilters}
        originRect={filtersOriginRect}
      />

      <ConfirmModal
        opened={purgeOpened}
        onClose={closePurge}
        title="Delete old audit logs"
        message={`Permanently delete all log entries older than ${retentionDays} days? This cannot be undone.`}
        loading={purging}
        onConfirm={handlePurge}
      />

      <ConfirmModal
        opened={exportOpened}
        onClose={closeExport}
        title="Export audit log"
        message="Download the currently filtered log entries as a CSV file?"
        confirmLabel="Download"
        confirmColor="brand"
        confirmIcon={<IconDownload size={18} />}
        loading={exporting}
        onConfirm={() => void handleExport()}
      />

      {/* Mobile-only: at lg the "Export" button in the filter row replaces the
          FAB. hiddenFrom sits on the toolbar itself: its Affix portals to
          <body>, so a wrapper element could not hide it. */}
      <FloatingToolbar bottomOffset="var(--settings-fab-bottom)" hiddenFrom="lg">
        <FloatingActionButton
          aria-label="Export audit log"
          className="c2-glass-fab--brand"
          onClick={openExport}
        >
          <IconDownload size={FAB_ICON_SIZE} />
        </FloatingActionButton>
      </FloatingToolbar>
    </Stack>
  );
}

interface LogDetailModalProps {
  row: AuditLog | null;
  onClose: () => void;
}

function LogDetailModal({ row, onClose }: LogDetailModalProps) {
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  return (
    <MotionModal
      opened={row !== null}
      onClose={onClose}
      title="Log details"
      centered
      size={isDesktop ? "lg" : "md"}
    >
      {row ? (
        <Stack gap="sm">
          <Group gap={6} wrap="wrap">
            <Text size="sm" fw={600}>
              {actionLabel(row.action)}
            </Text>
            <Badge size="xs" variant="light" color="brand">
              {row.action}
            </Badge>
          </Group>
          <Text size="sm" c="dimmed">
            {actorLabel(row)} · {formatLogTimestamp(row.createdAt)}
          </Text>
          {row.entityName ? (
            <Text size="sm">
              <Text component="span" c="dimmed">
                Entity:
              </Text>{" "}
              {row.entityName}
              {row.entityType ? ` (${row.entityType})` : ""}
            </Text>
          ) : null}
          {row.route || row.method ? (
            <Text size="xs" c="dimmed">
              {row.route ?? ""}
              {row.route && row.method ? " · " : ""}
              {row.method ?? ""}
            </Text>
          ) : null}
          <Divider />
          <AuditDetails details={row.details} />
        </Stack>
      ) : null}
    </MotionModal>
  );
}
