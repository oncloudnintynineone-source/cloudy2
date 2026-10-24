"use client";

import { useId, useState } from "react";
import { Badge, Box, Collapse, Group, Paper, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";

import { AuditDetails } from "@/components/AuditDetails";
import { useMotion } from "@/components/MotionProvider";
import type { HistoryEntryItem } from "@/lib/events/changeTrail";

/**
 * The read-only life story of one logical event: the create row, every
 * subsequent edit (as a before→after diff), and the delete row when it exists
 * — newest first, already collapsed by `buildHistoryEntries` (per-copy
 * same-minute fan-out merged, participant-notify rows dropped, matching the
 * inline My Events trail). Items whose `details` are still null are the
 * page-load preview: identical headers, not yet expandable until the freshly
 * fetched rows swap in.
 */
export function EventHistoryEntries({ items }: { items: HistoryEntryItem[] }) {
  return (
    <Stack gap="sm">
      {items.map((item, index) => (
        <HistoryEntry key={`${item.kind}-${item.absolute}-${index}`} item={item} />
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
function HistoryEntry({ item }: { item: HistoryEntryItem }) {
  const motion = useMotion();
  const [open, setOpen] = useState(false);
  const regionId = useId();
  const expandable = item.details !== null;

  const header = (
    <Group justify="space-between" align="flex-start" gap="xs" wrap="nowrap">
      <Stack gap={4} style={{ flexGrow: 1, minWidth: 0 }}>
        <Group gap={6} wrap="wrap">
          <Text size="sm" fw={600}>
            {item.label}
          </Text>
          <Badge size="xs" variant="light" color="brand">
            {item.absolute}
          </Badge>
        </Group>
        <Text size="xs" c="dimmed">
          {item.actor}
        </Text>
        {item.summary ? (
          <Text size="xs" c="dimmed" lineClamp={1}>
            {item.summary}
          </Text>
        ) : null}
      </Stack>
      {expandable && (
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
      )}
    </Group>
  );

  return (
    <Paper withBorder p="sm">
      {expandable ? (
        <UnstyledButton
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={regionId}
          style={{ width: "100%", textAlign: "left" }}
        >
          {header}
        </UnstyledButton>
      ) : (
        <Box>{header}</Box>
      )}
      {expandable && (
        <Collapse
          expanded={open}
          id={regionId}
          transitionDuration={motion.duration.popover}
          transitionTimingFunction={motion.easing.out}
          keepMounted={false}
        >
          <Box mt="xs">
            <AuditDetails details={item.details} />
          </Box>
        </Collapse>
      )}
    </Paper>
  );
}
