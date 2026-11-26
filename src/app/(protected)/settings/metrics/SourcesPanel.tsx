"use client";

import { Badge, Card, Code, Group, Stack, Text } from "@mantine/core";

import type { SourceStatus } from "@/lib/metrics/queries";

/**
 * Per-source honesty. A monitoring page earns trust by stating what it is *not*
 * looking at, and by naming the exact fix — the SQL statement, the console
 * path — rather than showing an empty panel and hoping nobody asks.
 */

const STATE_COLOR: Record<SourceStatus["state"], string> = {
  ok: "blue",
  pending: "yellow",
  unavailable: "gray",
  "not-installed": "yellow",
};

const STATE_LABEL: Record<SourceStatus["state"], string> = {
  ok: "Reporting",
  pending: "Pending",
  unavailable: "Unavailable",
  "not-installed": "Not installed",
};

export function SourcesPanel({ sources }: { sources: SourceStatus[] }) {
  return (
    <Card withBorder padding="sm" radius="sm">
      <Stack gap="sm">
        <Text fw={600} size="sm">
          Sources
        </Text>
        {sources.map((source) => (
          <Group key={source.key} gap="xs" align="flex-start" wrap="nowrap">
            <Badge size="xs" variant="light" color={STATE_COLOR[source.state]} w={104} ta="center">
              {STATE_LABEL[source.state]}
            </Badge>
            <Stack gap={2} style={{ flex: 1 }}>
              <Text size="xs" fw={500}>
                {source.label}
              </Text>
              <Text size="xs" c="dimmed">
                {renderDetail(source.detail)}
              </Text>
            </Stack>
          </Group>
        ))}
      </Stack>
    </Card>
  );
}

/** Render `SQL: …`-style fragments as code without a markup pass. */
function renderDetail(detail: string) {
  const parts = detail.split(/(CREATE EXTENSION IF NOT EXISTS pg_stat_statements;)/g);
  return parts.map((part, index) =>
    part.startsWith("CREATE EXTENSION") ? <Code key={index}>{part}</Code> : <span key={index}>{part}</span>,
  );
}
