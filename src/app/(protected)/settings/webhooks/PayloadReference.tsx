"use client";

import {
  Accordion,
  ActionIcon,
  Code,
  CopyButton,
  Group,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconCheck, IconCopy } from "@tabler/icons-react";

import { WEBHOOK_ACTIONS } from "@/lib/webhooks/payload";
import { buildExampleWebhookPayload } from "@/lib/webhooks/example";

const ACTIONS = [
  WEBHOOK_ACTIONS.eventCreated,
  WEBHOOK_ACTIONS.eventUpdated,
  WEBHOOK_ACTIONS.eventDeleted,
] as const;

const ACTION_LABELS: Record<(typeof ACTIONS)[number], string> = {
  [WEBHOOK_ACTIONS.eventCreated]: "event.created",
  [WEBHOOK_ACTIONS.eventUpdated]: "event.updated",
  [WEBHOOK_ACTIONS.eventDeleted]: "event.deleted",
};

const HEADERS = [
  {
    name: "Content-Type",
    value: "application/json",
  },
  {
    name: "X-Cloudy2-Event",
    value: "The action string — event.created | event.updated | event.deleted",
  },
  {
    name: "X-Cloudy2-Timestamp",
    value: "Unix seconds when the delivery was signed (part of the signature)",
  },
  {
    name: "X-Cloudy2-Signature",
    value: 'sha256=<hex> HMAC-SHA256 of "<timestamp>.<body>" keyed by the signing secret',
  },
] as const;

const FIELDS = [
  ["action", "string", "event.created | event.updated | event.deleted"],
  ["eventId", "uuid | null", "Group id shared by every department copy of the event"],
  ["googleEventIds", "string[]", "Google Calendar event ids touched by the change"],
  ["occurredAt", "ISO 8601", "When the mutation happened"],
  ["actor.name / actor.role", "string | null", "Who performed the mutation"],
  [
    "event.title / event.description",
    "string | null",
    "Rendered calendar title; raw text typed in the form",
  ],
  ["event.type", "string | null", "Event type name"],
  [
    "event.time",
    "string",
    'Pre-formatted UTC+8 range, e.g. "2026-08-21 (AM) – 2026-08-23 (PM)"',
  ],
  [
    "event.timeOption / start / end / startAmPm / endAmPm",
    "see example",
    "Structured times (naive UTC+8 strings); omitted when unrecoverable (legacy deletes)",
  ],
  ["event.outOfCamp", "boolean", "Out-of-camp flag"],
  ["event.location", "string | null", "Out-of-camp destination; null in camp"],
  ["event.departments", "string[]", "Department names the event lives in"],
  ["event.invitees", "string[]", "Invited attendees by display name (includes owner)"],
  ["event.creator", "string | null", "Event owner's display name"],
  ["changes", "{field: [before, after]}?", "Present on updates only — what changed"],
] as const;

function ExampleBlock({ action }: { action: (typeof ACTIONS)[number] }) {
  const json = buildExampleWebhookPayload(action);
  return (
    <div>
      <Group justify="space-between" mb={4}>
        <Text fw={600} size="sm">
          POST body · {ACTION_LABELS[action]}
        </Text>
        <CopyButton value={json}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? "Copied" : "Copy JSON"}>
              <ActionIcon
                aria-label="Copy payload"
                onClick={copy}
                color={copied ? "teal" : "gray"}
                variant="subtle"
              >
                {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
      </Group>
      <Code block style={{ maxHeight: 320, overflowY: "auto" }} fz="xs">
        {json}
      </Code>
    </div>
  );
}

/**
 * In-app integration guide for webhook receivers: actions, headers, live
 * example payloads (generated from the real builder), and signature
 * verification. Rendered under the endpoint list on the Webhooks tab.
 */
export function PayloadReference() {
  return (
    <Accordion variant="separated" mb="xl">
      <Accordion.Item value="schema">
        <Accordion.Control>Integration guide — payload schema</Accordion.Control>
        <Accordion.Panel>
          <Stack gap="md">
            <Text size="sm">
              Every enabled endpoint receives a signed <Code>POST</Code>{" "}
              (<Code>application/json</Code>) for each successful event create, update, and
              delete. The examples below are generated from the same code path as real
              deliveries.
            </Text>
            <Table withTableBorder fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Field</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Meaning</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {FIELDS.map(([field, type, meaning]) => (
                  <Table.Tr key={field}>
                    <Table.Td>
                      <Code fz="xs">{field}</Code>
                    </Table.Td>
                    <Table.Td>{type}</Table.Td>
                    <Table.Td>{meaning}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      <Accordion.Item value="examples">
        <Accordion.Control>Integration guide — example payloads</Accordion.Control>
        <Accordion.Panel>
          <Stack gap="lg">
            {ACTIONS.map((action) => (
              <ExampleBlock key={action} action={action} />
            ))}
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      <Accordion.Item value="signature">
        <Accordion.Control>Integration guide — headers &amp; signatures</Accordion.Control>
        <Accordion.Panel>
          <Stack gap="md">
            <Table withTableBorder fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Header</Table.Th>
                  <Table.Th>Value</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {HEADERS.map((header) => (
                  <Table.Tr key={header.name}>
                    <Table.Td>
                      <Code fz="xs">{header.name}</Code>
                    </Table.Td>
                    <Table.Td>{header.value}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            <Text size="sm">
              When a signing secret is configured, verify each delivery by recomputing the
              HMAC over the raw request body prefixed with the timestamp and comparing:
            </Text>
            <Code block fz="xs">
              {`import { createHmac, timingSafeEqual } from "node:crypto";

export function verify(req) {
  const timestamp = req.headers["x-cloudy2-timestamp"];
  const signature = req.headers["x-cloudy2-signature"]; // "sha256=<hex>"
  const expected = createHmac("sha256", SECRET)
    .update(\`\${timestamp}.\${req.rawBody}\`)
    .digest("hex");
  return timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature.replace(/^sha256=/, "")),
  );
}`}
            </Code>
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
