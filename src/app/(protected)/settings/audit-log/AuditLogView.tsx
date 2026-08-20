"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Divider,
  Group,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconDownload, IconTrash, IconX } from "@tabler/icons-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  FAB_ICON_SIZE,
  FloatingActionButton,
  FloatingToolbar,
} from "@/components/FloatingToolbar";
import { NoKeyboardSelect } from "@/components/NoKeyboardSelect";
import { purgeAuditLogs, loadMoreAuditLogs } from "@/lib/audit/actions";
import { listAuditActions } from "@/lib/audit/build";
import { actionLabel, actorLabel, formatAuditDetails, formatLogTimestamp } from "@/lib/audit/format";
import type { AuditFilters } from "@/lib/audit/queries";
import { SETTINGS_TAB_BAR_OFFSET } from "@/app/(protected)/settings/settingsTabBar";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import type { AuditLog } from "@/db/schema";

interface AuditLogViewProps {
  initialRows: AuditLog[];
  nextCursor: string | null;
  filters: AuditFilters;
  actors: string[];
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
  entityTypes,
  retentionDays,
}: AuditLogViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [rows, setRows] = useState(initialRows);
  const [cursor, setCursor] = useState(nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchInput, setSearchInput] = useState(filters.query ?? "");

  const [detail, setDetail] = useState<AuditLog | null>(null);
  const [purgeOpened, { open: openPurge, close: closePurge }] = useDisclosure(false);
  const [exportOpened, { open: openExport, close: closeExport }] = useDisclosure(false);

  const actionOptions = useMemo(
    () => [
      { value: "", label: "All actions" },
      ...listAuditActions().map((action) => ({ value: action, label: actionLabel(action) })),
    ],
    [],
  );

  const actorOptions = useMemo(
    () => [{ value: "", label: "All actors" }, ...actors.map((actor) => ({ value: actor, label: actor }))],
    [actors],
  );

  const entityOptions = useMemo(
    () => [
      { value: "", label: "All entity types" },
      ...entityTypes.map((entity) => ({ value: entity, label: entity })),
    ],
    [entityTypes],
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
      startTransition(() => {
        router.push(buildHref(updates));
      });
    },
    [buildHref, router, startTransition],
  );

  const applyFilters = useCallback(
    (updates: Record<string, string | null>) => {
      navigate(updates);
    },
    [navigate],
  );

  const resetFilters = () => {
    setSearchInput("");
    navigate({ actor: null, action: null, entity: null, from: null, to: null, q: null });
  };

  const hasFilters =
    filters.actor !== null || filters.action !== null || filters.entityType !== null ||
    filters.from !== null || filters.to !== null || filters.query !== null;

  const exportUrl = useMemo(() => {
    const params = new URLSearchParams();
    const put = (key: string, value: string | null) => {
      if (value) {
        params.set(key, value);
      }
    };
    put("actor", filters.actor);
    put("action", filters.action);
    put("entity", filters.entityType);
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
      router.refresh();
    } else {
      notifications.show({ color: "red", message: result.error });
    }
  };

  return (
    <Stack pb="xl">
      <Paper withBorder p="sm">
        <Stack gap="sm">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              applyFilters({ q: searchInput.trim() || null });
            }}
          >
            <TextInput
              placeholder="Search actor, entity, route…"
              value={searchInput}
              onChange={(event) => setSearchInput(event.currentTarget.value)}
              rightSection={
                searchInput ? (
                  <ActionIcon variant="subtle" onClick={() => setSearchInput("")} aria-label="Clear search">
                    <IconX size={16} />
                  </ActionIcon>
                ) : null
              }
            />
          </form>
          <NoKeyboardSelect
            data={actorOptions}
            value={filters.actor ?? ""}
            onChange={(value) => applyFilters({ actor: value || null })}
            label="Actor"
            searchable
            clearable
          />
          <NoKeyboardSelect
            data={actionOptions}
            value={filters.action ?? ""}
            onChange={(value) => applyFilters({ action: value || null })}
            label="Action"
            clearable
          />
          <NoKeyboardSelect
            data={entityOptions}
            value={filters.entityType ?? ""}
            onChange={(value) => applyFilters({ entity: value || null })}
            label="Entity type"
            clearable
          />
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
          {hasFilters ? (
            <Group justify="flex-end">
              <Button variant="subtle" size="xs" onClick={resetFilters} leftSection={<IconX size={14} />}>
                Reset filters
              </Button>
            </Group>
          ) : null}
        </Stack>
      </Paper>

      <Stack gap="sm" style={{ opacity: isPending ? 0.6 : 1, transition: "opacity 150ms ease-out" }}>
        {rows.length === 0 ? (
          <Text c="dimmed" ta="center" py="lg">
            No log entries match these filters.
          </Text>
        ) : (
          rows.map((row) => (
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
          ))
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

      <Modal opened={purgeOpened} onClose={closePurge} title="Delete old audit logs" centered size="sm">
        <Text size="sm">
          Permanently delete all log entries older than {retentionDays} days? This cannot be undone.
        </Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={closePurge}>
            Cancel
          </Button>
          <Button color="red" onClick={handlePurge}>
            Delete
          </Button>
        </Group>
      </Modal>

      <Modal opened={exportOpened} onClose={closeExport} title="Export audit log" centered size="sm">
        <Text size="sm">
          Download the currently filtered log entries as a CSV file?
        </Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={closeExport}>
            Cancel
          </Button>
          <Button
            color="brand"
            leftSection={<IconDownload size={18} />}
            onClick={() => {
              closeExport();
              window.location.href = exportUrl;
            }}
          >
            Download
          </Button>
        </Group>
      </Modal>

      <FloatingToolbar bottomOffset={SETTINGS_TAB_BAR_OFFSET}>
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
  const details = row ? formatAuditDetails(row.details) : null;
  return (
    <Modal opened={row !== null} onClose={onClose} title="Log details" centered size="md">
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
          {details.kind === "changes" && details.lines.length > 0 ? (
            <ScrollArea.Autosize mah={320} type="auto">
              <Stack gap={4}>
                {details.lines.map((line) => (
                  <Paper key={line.label} withBorder p="xs">
                    <Stack gap={2}>
                      <Text size="xs" fw={600} c="dimmed">
                        {line.label}
                      </Text>
                      <Text size="sm">
                        <Text component="span" c="red" size="sm" inherit>
                          {line.before ?? "∅"}
                        </Text>
                        {" → "}
                        <Text component="span" c="teal" size="sm" inherit>
                          {line.after ?? "∅"}
                        </Text>
                      </Text>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </ScrollArea.Autosize>
          ) : (
            <ScrollArea.Autosize mah={320} type="auto">
              <Text component="pre" size="xs" style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {details.json}
              </Text>
            </ScrollArea.Autosize>
          )}
        </Stack>
      ) : null}
    </Modal>
  );
}
