"use client";

import { useId, useState } from "react";
import { Badge, Box, Collapse, Group, Paper, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";

import { AuditDetails } from "@/components/AuditDetails";
import { useMotion } from "@/components/MotionProvider";
import { actionLabel, actorLabel, changeSummary, formatLogTimestamp } from "@/lib/audit/format";
import type { AuditLog } from "@/db/schema";

/**
 * The read-only life story of one logical event: the create row, every
 * subsequent edit (as a before→after diff), and the delete row when it exists.
 * Newest first (reads like a changelog); the server returns oldest-first.
 * Shared by the history modal (`EventHistoryModal`).
 */
export function EventHistoryEntries({ rows }: { rows: AuditLog[] }) {
  const ordered = [...rows].reverse();
  return (
    <Stack gap="sm">
      {ordered.map((row) => (
        <HistoryEntry key={row.id} row={row} />
      ))}
    </Stack>
  );
}

/**
 * One collapsible history entry: an always-visible header (action, timestamp,
 * actor, and a one-line summary of what changed) that toggles the full
 * before→after detail. Collapsed by default — every entry opens only on tap.
 * Follows the shared disclosure recipe used by `ClashCard`
 * (`src/components/clashCards.tsx`).
 */
function HistoryEntry({ row }: { row: AuditLog }) {
  const motion = useMotion();
  const [open, setOpen] = useState(false);
  const regionId = useId();
  const summary = changeSummary(row.details, row.entityName ?? null);
  return (
    <Paper withBorder p="sm">
      <UnstyledButton
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={regionId}
        style={{ width: "100%", textAlign: "left" }}
      >
        <Group justify="space-between" align="flex-start" gap="xs" wrap="nowrap">
          <Stack gap={4} style={{ flexGrow: 1, minWidth: 0 }}>
            <Group gap={6} wrap="wrap">
              <Text size="sm" fw={600}>
                {actionLabel(row.action)}
              </Text>
              <Badge size="xs" variant="light" color="brand">
                {formatLogTimestamp(row.createdAt)}
              </Badge>
            </Group>
            <Text size="xs" c="dimmed">
              {actorLabel(row)}
            </Text>
            {summary ? (
              <Text size="xs" c="dimmed" lineClamp={1}>
                {summary}
              </Text>
            ) : null}
          </Stack>
          <IconChevronDown
            size={16}
            style={{
              flexShrink: 0,
              marginTop: 2,
              transform: open ? "rotate(180deg)" : undefined,
              transition: `transform ${motion.duration.micro}ms ${motion.easing.out}`,
            }}
            aria-hidden
          />
        </Group>
      </UnstyledButton>
      <Collapse
        expanded={open}
        id={regionId}
        transitionDuration={motion.duration.popover}
        transitionTimingFunction={motion.easing.out}
        keepMounted={false}
      >
        <Box mt="xs">
          <AuditDetails details={row.details} />
        </Box>
      </Collapse>
    </Paper>
  );
}
