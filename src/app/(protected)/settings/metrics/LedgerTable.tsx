"use client";

import { useState } from "react";
import {
  Alert,
  Badge,
  Card,
  Group,
  Paper,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";

import { formatBytes, formatCount, formatLedgerDay, formatRatio } from "@/lib/metrics/format";
import type { DayDetail, LedgerDayRow } from "@/lib/metrics/queries";

/**
 * The daily ledger: one row per closed day, newest first, with the newest
 * selected. Choosing a day swaps the "what drove it" panel underneath — the
 * drill-down that turns "egress was high" into "`/api/dashboard/load` moved
 * 61% of it".
 *
 * Detail exists for the days the page was rendered with (the last week); older
 * rows still compare, they just don't expand. That is a payload decision, not a
 * data one — every row is in the database.
 *
 * Desktop is a table, mobile is a card list, switched declaratively with
 * `visibleFrom`/`hiddenFrom` (the audit log's recipe) rather than a media-query
 * hook, so both tiers ship in one render.
 */

interface TopQueryRow {
  queryId: string;
  snippet: string;
  calls: number;
  totalMs: number;
  meanMs: number;
  rows: number;
}

export function LedgerTable({
  days,
  details,
  statementsInstalled,
}: {
  days: LedgerDayRow[];
  details: DayDetail[];
  statementsInstalled: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  if (days.length === 0) {
    return null;
  }

  const ordered = [...days].sort((a, b) => (a.day < b.day ? 1 : -1));
  // Derived, not synchronised in an effect: a selection that no longer exists
  // (a refresh closing a new day, a retention purge dropping old ones) falls
  // back to the newest row at render time.
  const activeDay = selected && days.some((day) => day.day === selected) ? selected : ordered[0].day;
  const detail = details.find((entry) => entry.day === activeDay) ?? null;

  return (
    <Stack gap="sm">
      <Paper withBorder visibleFrom="lg">
        <Table withRowBorders={false} highlightOnHover tabularNums>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={92}>Day</Table.Th>
              <Table.Th w={104}>Database</Table.Th>
              <Table.Th w={84}>Active</Table.Th>
              <Table.Th w={104}>Egress</Table.Th>
              <Table.Th w={92}>Requests</Table.Th>
              <Table.Th w={72} ta="right">
                Errors
              </Table.Th>
              <Table.Th>Top route</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {ordered.map((row) => (
              <Table.Tr
                key={row.day}
                data-active={row.day === activeDay || undefined}
                style={{ cursor: "pointer" }}
                onClick={() => setSelected(row.day)}
              >
                <Table.Td fw={600}>{formatLedgerDay(row.day)}</Table.Td>
                <Table.Td>{formatBytes(row.storageBytes)}</Table.Td>
                <Table.Td>{formatActive(row.activeMinutes)}</Table.Td>
                <Table.Td>{formatBytes(row.egressBytes)}</Table.Td>
                <Table.Td>{formatCount(row.requests)}</Table.Td>
                <Table.Td ta="right">
                  {row.errors && row.errors > 0 ? (
                    <Badge size="xs" color="red" variant="light">
                      {formatCount(row.errors)}
                    </Badge>
                  ) : (
                    "0"
                  )}
                </Table.Td>
                <Table.Td c="dimmed">
                  <Text size="xs" lineClamp={1}>
                    {row.topRoute ? row.topRoute.route : "—"}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>

      <Stack gap="xs" hiddenFrom="lg">
        {ordered.map((row) => (
          <Card
            key={row.day}
            withBorder
            padding="xs"
            component="button"
            type="button"
            onClick={() => setSelected(row.day)}
            aria-pressed={row.day === activeDay}
            style={{ textAlign: "left", width: "100%" }}
          >
            <Group justify="space-between" wrap="nowrap">
              <Text fw={600} size="sm">
                {formatLedgerDay(row.day)}
              </Text>
              <Text size="xs" c="dimmed">
                {formatBytes(row.egressBytes)} egress
              </Text>
            </Group>
            <Group gap="md" mt={4}>
              <Text size="xs">
                <Text component="span" c="dimmed">
                  db{" "}
                </Text>
                {formatBytes(row.storageBytes)}
              </Text>
              <Text size="xs">
                <Text component="span" c="dimmed">
                  active{" "}
                </Text>
                {formatActive(row.activeMinutes)}
              </Text>
              <Text size="xs">
                <Text component="span" c="dimmed">
                  req{" "}
                </Text>
                {formatCount(row.requests)}
              </Text>
            </Group>
          </Card>
        ))}
      </Stack>

      {detail ? (
        <DayDetailPanel detail={detail} statementsInstalled={statementsInstalled} />
      ) : (
        <Text size="xs" c="dimmed">
          Drill-down is available for the most recent {details.length} days. Older rows still
          compare above.
        </Text>
      )}
    </Stack>
  );
}

function formatActive(value: number | null): string {
  if (value === null) {
    return "—";
  }
  return value < 60 ? `${Math.round(value)}m` : `${(value / 60).toFixed(1)}h`;
}

function DayDetailPanel({
  detail,
  statementsInstalled,
}: {
  detail: DayDetail;
  statementsInstalled: boolean;
}) {
  const totalBytes = detail.topRoutes.reduce((sum, route) => sum + route.bytes, 0);
  const queries = (detail.topQueries ?? []) as TopQueryRow[];

  return (
    <Card withBorder padding="sm">
      <Stack gap="md">
        <Group justify="space-between" wrap="wrap">
          <Text fw={600} size="sm">
            What drove {formatLedgerDay(detail.day)}
          </Text>
          {detail.gapDays > 1 && (
            <Badge size="xs" variant="light" color="yellow">
              covers {detail.gapDays} days
            </Badge>
          )}
        </Group>

        {detail.statsReset && (
          <Alert color="yellow" icon={<IconAlertTriangle size={16} />} title="Statistics were reset">
            Postgres counters were reset between snapshots, so this day&apos;s database-health
            differences are unavailable. Sizes and app counters are unaffected.
          </Alert>
        )}

        {detail.topRoutes.length > 0 ? (
          <Stack gap={6}>
            <Text size="xs" fw={700} c="dimmed" tt="uppercase">
              Bytes read, by route
            </Text>
            {detail.topRoutes.slice(0, 8).map((route) => {
              const share = totalBytes > 0 ? route.bytes / totalBytes : 0;
              return (
                <Group key={route.route} gap="xs" wrap="nowrap">
                  <Text size="xs" style={{ flex: 1 }} lineClamp={1}>
                    {route.route}
                  </Text>
                  <Text size="xs" w={80} ta="right">
                    {formatBytes(route.bytes)}
                  </Text>
                  <Badge size="xs" variant="light" color={share > 0.5 ? "yellow" : "gray"}>
                    {formatRatio(share, 0)}
                  </Badge>
                </Group>
              );
            })}
          </Stack>
        ) : (
          <Text size="xs" c="dimmed">
            No per-route byte accounting for this day yet — that counter ships with the request
            instrumentation.
          </Text>
        )}

        {queries.length > 0 ? (
          <Stack gap={4}>
            <Text size="xs" fw={700} c="dimmed" tt="uppercase">
              Top queries by total time
            </Text>
            <Stack gap={2}>
              {queries.slice(0, 10).map((query) => (
                <Group key={query.queryId} gap="xs" wrap="nowrap" align="flex-start">
                  <Text size="xs" ff="monospace" style={{ flex: 1 }} lineClamp={1} title={query.snippet}>
                    {query.snippet}
                  </Text>
                  <Text size="xs" w={64} ta="right">
                    {formatCount(query.calls)}×
                  </Text>
                  <Text size="xs" w={76} ta="right">
                    {Math.round(query.totalMs).toLocaleString("en-US")} ms
                  </Text>
                </Group>
              ))}
            </Stack>
          </Stack>
        ) : (
          <Text size="xs" c="dimmed">
            {statementsInstalled
              ? "No statement statistics for this day yet."
              : "Install pg_stat_statements to see which queries drive the load (see Sources below)."}
          </Text>
        )}

        {(detail.cacheReads.length > 0 || detail.dispatchFailures.length > 0) && (
          <Group gap="lg" wrap="wrap">
            {detail.cacheReads.map((entry) => (
              <Text key={entry.result} size="xs" c="dimmed">
                cache {entry.result}: <b>{formatCount(entry.count)}</b>
              </Text>
            ))}
            {detail.dispatchFailures.map((entry) => (
              <Text key={entry.kind} size="xs" c="red">
                {entry.kind} failures: <b>{formatCount(entry.count)}</b>
              </Text>
            ))}
          </Group>
        )}
      </Stack>
    </Card>
  );
}
