"use client";

import { Paper, ScrollArea, Stack, Text } from "@mantine/core";

import {
  EMPTY_VALUE,
  formatAuditDetails,
  type AuditDisplayDetails,
  type DetailValue,
} from "@/lib/audit/format";

/**
 * Renders one audit row's `details` payload (see `formatAuditDetails`): the
 * before→after change lines for a `FieldDiff`, the flat label/value lines for a
 * snapshot, or the pretty-printed JSON fallback. Shared by the admin Audit Log
 * detail modal and the per-event history page so the two can never diverge.
 */
export function AuditDetails({ details }: { details: unknown }) {
  const formatted = formatAuditDetails(details);
  return <AuditDetailsBody details={formatted} />;
}

function AuditDetailsBody({ details }: { details: AuditDisplayDetails }) {
  if (details.kind === "json") {
    return (
      <ScrollArea.Autosize mah={320} type="auto">
        <Text
          component="pre"
          size="xs"
          style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}
        >
          {details.json}
        </Text>
      </ScrollArea.Autosize>
    );
  }
  return (
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
                    {" \u2192 "}
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
