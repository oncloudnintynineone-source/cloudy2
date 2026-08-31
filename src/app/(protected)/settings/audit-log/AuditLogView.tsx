"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Menu,
  Modal,
  Paper,
  Pill,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput,
  useMantineTheme,
  VisuallyHidden,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconDownload, IconFilter, IconFilterOff, IconTrash, IconX } from "@tabler/icons-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { EmptyState } from "@/components/EmptyState";
import { FilterButton } from "@/components/FilterButton";
import { FilterModal, type FilterGroup } from "@/components/FilterModal";
import { FAB_ICON_SIZE, FloatingActionButton, FloatingToolbar } from "@/components/FloatingToolbar";
import { LoadingStatus } from "@/components/LoadingStatus";
import { purgeAuditLogs, loadMoreAuditLogs } from "@/lib/audit/actions";
import { listAuditActions } from "@/lib/audit/build";
import {
  actionLabel,
  actorLabel,
  EMPTY_VALUE,
  formatAuditDetails,
  formatLogTimestamp,
  type DetailValue,
} from "@/lib/audit/format";
import type { AuditFilters } from "@/lib/audit/queries";
import { CONTENT_ENTER_CLASS, useContentEnter } from "@/lib/loading/contentEnter";
import { useMinSkeletonHold } from "@/lib/loading/minHoldLoading";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import type { AuditLog } from "@/db/schema";

import { AuditLogRowSkeleton } from "./AuditLogRowSkeleton";
import { SettingsTableSkeleton } from "../SettingsTableSkeleton";
import { invalidateCurrentPathCaches } from "@/lib/pwa/client";

interface AuditLogViewProps {
  initialRows: AuditLog[];
  nextCursor: string | null;
  filters: AuditFilters;
  /** Distinct actor names seen in the log, plus any name in the applied filter. */
  actors: string[];
  /** Actor name → roster department name (null for "Admin"/deleted users). */
  actorDepartments: Record<string, string | null>;
  entityTypes: string[];
  retentionDays: number;
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
  nextCursor,
  filters,
  actors,
  actorDepartments,
  entityTypes,
  retentionDays,
}: AuditLogViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const [isPending, startTransition] = useTransition();

  // Skeleton-only loading: filter changes (URL transitions) show a row-card
  // skeleton with a minimum ~350ms hold, then the list fades in on the reveal.
  const listLoading = useMinSkeletonHold(isPending);
  const listRef = useRef<HTMLDivElement | null>(null);
  useContentEnter(listRef, !listLoading);

  const [rows, setRows] = useState(initialRows);
  const [cursor, setCursor] = useState(nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchInput, setSearchInput] = useState(filters.query ?? "");

  const [detail, setDetail] = useState<AuditLog | null>(null);
  const [purgeOpened, { open: openPurge, close: closePurge }] = useDisclosure(false);
  const [exportOpened, { open: openExport, close: closeExport }] = useDisclosure(false);
  const [filtersOpened, { open: openFilters, close: closeFilters }] = useDisclosure(false);
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
        options: actors.map((name) => ({
          value: name,
          label: name,
          department: actorDepartments[name] ?? "Other",
        })),
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
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      params.delete("cursor");
      const query = params.toString();
      return query ? `${pathname}?${query}` : pathname;
    },
    [searchParams, pathname],
  );

  const navigate = useCallback(
    (updates: Record<string, string | null>) => {
      const query = searchParams.toString();
      const next = buildHref(updates);
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

  // Per-pill removal mirrors the parade-state filters: drop one value from the
  // applied filter and navigate with the remainder (empty → param removed).
  function removeFilterValue(field: "actor" | "action" | "entity", value: string) {
    const list =
      field === "actor" ? filters.actor : field === "action" ? filters.action : filters.entityType;
    const next = list.filter((entry) => entry !== value);
    applyFilters({ [field]: next.length > 0 ? next.join(",") : null });
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

  const handleLoadMore = async () => {
    if (!cursor || loadingMore) {
      return;
    }
    setLoadingMore(true);
    try {
      const page = await loadMoreAuditLogs({ ...filters, cursor });
      setRows((previous) => [...previous, ...page.rows]);
      setCursor(page.nextCursor);
    } catch (error) {
      console.error("[audit] Failed to load more", error);
      notifications.show({ color: "red", message: "Failed to load more entries" });
    } finally {
      setLoadingMore(false);
    }
  };

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
        void invalidateCurrentPathCaches().then(() => router.refresh());
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
          <FilterButton activeCount={activeFilterCount} onClick={openFilters} />
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
            transitionProps={{ transition: "pop-top-right", duration: 150, timingFunction: "ease" }}
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
                onClick={openFilters}
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

      {/* Applied-filter pills (parade-state pattern): one removable pill per
          selected value, so the active filters stay visible without reopening
          the dialog. */}
      {activeFilterCount > 0 ? (
        <Group gap={6} wrap="wrap">
          {filters.actor.map((name) => (
            <Pill
              key={`actor:${name}`}
              withRemoveButton
              onRemove={() => removeFilterValue("actor", name)}
            >
              {name}
            </Pill>
          ))}
          {filters.action.map((action) => (
            <Pill
              key={`action:${action}`}
              withRemoveButton
              onRemove={() => removeFilterValue("action", action)}
            >
              {actionLabel(action)}
            </Pill>
          ))}
          {filters.entityType.map((entity) => (
            <Pill
              key={`entity:${entity}`}
              withRemoveButton
              onRemove={() => removeFilterValue("entity", entity)}
            >
              {entity}
            </Pill>
          ))}
          {filters.query ? (
            <Pill
              withRemoveButton
              onRemove={() => {
                setSearchInput("");
                applyFilters({ q: null });
              }}
            >
              Search: {filters.query}
            </Pill>
          ) : null}
          {filters.from ? (
            <Pill withRemoveButton onRemove={() => applyFilters({ from: null })}>
              From {filters.from}
            </Pill>
          ) : null}
          {filters.to ? (
            <Pill withRemoveButton onRemove={() => applyFilters({ to: null })}>
              To {filters.to}
            </Pill>
          ) : null}
        </Group>
      ) : null}

      <Stack gap="sm" ref={listRef} className={CONTENT_ENTER_CLASS}>
        {listLoading ? (
          <>
            <LoadingStatus label="Loading audit log" />
            {/* Mobile: card list */}
            <Stack gap="sm" hiddenFrom="lg">
              {Array.from({ length: 5 }).map((_, i) => (
                <AuditLogRowSkeleton key={i} />
              ))}
            </Stack>

            {/* Desktop: data table (Time / Actor / Action / Entity / Route / Details) */}
            <SettingsTableSkeleton columns={[2, 1.5, 1.5, 2, 2, 1.5]} rows={5} visibleFrom="lg" />
          </>
        ) : rows.length === 0 ? (
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
              {rows.map((row) => (
                <Paper key={row.id} withBorder p="sm">
                  <Stack gap={4}>
                    <Group justify="space-between" wrap="nowrap" align="flex-start">
                      <Text fw={600} size="sm">
                        {actionLabel(row.action)}
                      </Text>
                      <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                        {formatLogTimestamp(row.createdAt)}
                      </Text>
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

            {/* Desktop: data table */}
            <Paper withBorder visibleFrom="lg">
              <Table withRowBorders={false} highlightOnHover tabularNums>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Time</Table.Th>
                    <Table.Th>Actor</Table.Th>
                    <Table.Th>Action</Table.Th>
                    <Table.Th>Entity</Table.Th>
                    <Table.Th>Route</Table.Th>
                    <Table.Th ta="right">
                      <VisuallyHidden>Details</VisuallyHidden>
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rows.map((row) => (
                    <Table.Tr key={row.id}>
                      <Table.Td style={{ whiteSpace: "nowrap" }}>
                        <Text size="sm" c="dimmed">
                          {formatLogTimestamp(row.createdAt)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{actorLabel(row)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={600}>
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
                              <Text size="sm" truncate>
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
                      <Table.Td>
                        {row.route || row.method ? (
                          <Group gap={6} wrap="nowrap">
                            {row.method ? (
                              <Badge size="xs" variant="outline" color="gray">
                                {row.method}
                              </Badge>
                            ) : null}
                            {row.route ? (
                              <Text size="sm" c="dimmed" truncate>
                                {row.route}
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
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>
          </>
        )}

        {cursor ? (
          <Group justify="center">
            <Button
              variant="default"
              loading={loadingMore}
              loaderProps={BUTTON_LOADER_PROPS}
              onClick={handleLoadMore}
            >
              Load more
            </Button>
          </Group>
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
      />

      <Modal
        opened={purgeOpened}
        onClose={closePurge}
        title="Delete old audit logs"
        centered
        size="sm"
      >
        <Text size="sm">
          Permanently delete all log entries older than {retentionDays} days? This cannot be undone.
        </Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={closePurge}>
            Cancel
          </Button>
          <Button
            color="red"
            loading={purging}
            loaderProps={BUTTON_LOADER_PROPS}
            onClick={handlePurge}
          >
            Delete
          </Button>
        </Group>
      </Modal>

      <Modal
        opened={exportOpened}
        onClose={closeExport}
        title="Export audit log"
        centered
        size="sm"
      >
        <Text size="sm">Download the currently filtered log entries as a CSV file?</Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={closeExport}>
            Cancel
          </Button>
          <Button
            color="brand"
            loading={exporting}
            loaderProps={BUTTON_LOADER_PROPS}
            leftSection={<IconDownload size={18} />}
            onClick={() => void handleExport()}
          >
            Download
          </Button>
        </Group>
      </Modal>

      {/* Mobile-only: at lg the "Export" button in the filter row replaces the
          FAB. hiddenFrom sits on the toolbar itself: its Affix portals to
          <body>, so a wrapper element could not hide it. */}
      <FloatingToolbar bottomOffset="var(--settings-fab-bottom)" hiddenFrom="lg">
        <FloatingActionButton aria-label="Export audit log" onClick={openExport}>
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
  const details = row ? formatAuditDetails(row.details) : null;
  return (
    <Modal
      opened={row !== null}
      onClose={onClose}
      title="Log details"
      centered
      size={isDesktop ? "lg" : "md"}
    >
      {row && details ? (
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
          {details.kind === "json" ? (
            <ScrollArea.Autosize mah={320} type="auto">
              <Text
                component="pre"
                size="xs"
                style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}
              >
                {details.json}
              </Text>
            </ScrollArea.Autosize>
          ) : (
            <ScrollArea.Autosize mah={420} type="auto">
              <Stack gap="sm">
                {details.values.length > 0 ? <DetailValueList items={details.values} /> : null}
                {details.kind === "changes" && details.lines.length > 0 ? (
                  <Stack gap={4}>
                    {details.lines.map((line) => (
                      <Paper key={line.label} withBorder p="xs">
                        <Stack gap={2}>
                          <Text size="xs" fw={600} c="dimmed">
                            {line.label}
                          </Text>
                          <Text size="sm">
                            <Text component="span" c="red" size="sm" inherit>
                              {line.before ?? EMPTY_VALUE}
                            </Text>
                            {" → "}
                            <Text component="span" c="teal" size="sm" inherit>
                              {line.after ?? EMPTY_VALUE}
                            </Text>
                          </Text>
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                ) : null}
                {details.kind === "changes" && details.after.length > 0 ? (
                  <Stack gap={4}>
                    <Text size="xs" fw={600} c="dimmed">
                      Resulting state
                    </Text>
                    <DetailValueList items={details.after} />
                  </Stack>
                ) : null}
                {details.kind === "changes" &&
                details.lines.length === 0 &&
                details.values.length === 0 &&
                details.after.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    No changes recorded.
                  </Text>
                ) : null}
              </Stack>
            </ScrollArea.Autosize>
          )}
        </Stack>
      ) : null}
    </Modal>
  );
}

function DetailValueList({ items }: { items: DetailValue[] }) {
  return (
    <Stack gap={4}>
      {items.map((item) => (
        <Paper key={item.label} withBorder p="xs">
          <Stack gap={2}>
            <Text size="xs" fw={600} c="dimmed">
              {item.label}
            </Text>
            <Text size="sm" style={{ wordBreak: "break-word" }}>
              {item.value || EMPTY_VALUE}
            </Text>
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}
