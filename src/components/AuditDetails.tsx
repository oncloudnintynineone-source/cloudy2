"use client";

import { useState } from "react";

import { Button, Paper, Stack, Text } from "@mantine/core";

import {
  EMPTY_VALUE,
  formatAuditDetails,
  type AuditDetailOptions,
  type AuditDisplayDetails,
  type DetailValue,
} from "@/lib/audit/format";

/**
 * Renders one audit row's `details` payload (see `formatAuditDetails`): the
 * before→after change lines for a `FieldDiff`, the flat label/value lines for a
 * snapshot, or the pretty-printed JSON fallback. Shared by the admin Audit Log
 * detail modal and the event history modal so the two can never diverge.
 *
 * There is deliberately **no scroll container in here**: both hosts already
 * scroll (the modal body), and a nested one inside a modal is how you get a
 * wheel that has to be aimed before it does anything. Long content is wrapped
 * and, for the JSON fallback, clamped with an explicit Show more instead.
 */
export function AuditDetails({ details, ...options }: { details: unknown } & AuditDetailOptions) {
  return <FormattedAuditDetails details={formatAuditDetails(details, options)} />;
}

/** The same renderer for a payload the caller already formatted. */
export function FormattedAuditDetails({ details }: { details: AuditDisplayDetails }) {
  if (details.kind === "json") {
    return <JsonDetails json={details.json} />;
  }
  return (
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
                <Text size="sm" style={{ wordBreak: "break-word" }}>
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
  );
}

/**
 * A JSON payload past this length is almost never read end to end, so it opens
 * clamped; below it the text simply fits and the toggle would be noise.
 */
const JSON_CLAMP_CHARS = 1200;
const JSON_CLAMP_LINES = 14;

function JsonDetails({ json }: { json: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const text = json ?? "";
  const clamped = text.length > JSON_CLAMP_CHARS && !expanded;
  return (
    <Stack gap={6}>
      <Text
        component="pre"
        size="xs"
        style={{
          margin: 0,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          ...(clamped
            ? {
                display: "-webkit-box",
                WebkitLineClamp: JSON_CLAMP_LINES,
                WebkitBoxOrient: "vertical" as const,
                overflow: "hidden",
              }
            : null),
        }}
      >
        {json}
      </Text>
      {text.length > JSON_CLAMP_CHARS ? (
        <Button
          variant="subtle"
          size="xs"
          w="fit-content"
          m={0}
          p={0}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show less" : "Show more"}
        </Button>
      ) : null}
    </Stack>
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
