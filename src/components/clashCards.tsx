import { useState, useId, type ReactNode } from "react";
import Link from "next/link";
import {
  Badge,
  Box,
  Collapse,
  Group,
  Paper,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { IconAlertTriangle, IconChevronDown, IconChevronRight } from "@tabler/icons-react";

import { clashWhenLabel } from "@/lib/events/clashDisplay";
import type { EventClashEntry } from "@/lib/events/clashActions";
import { MOTION } from "@/lib/motion/timing";

/**
 * The shared amber clash/double-booking report card. Collapsed by default to a
 * one-line summary heading; tapping the heading expands the full detail.
 * Used by the Double Booking page reports and the wizard's review-step
 * advisory so both surfaces collapse/expand identically. See
 * docs/user-clashes.md §1.8 and docs/event-clashes.md §1.6.
 *
 * The polite live-region announcement is scoped to the always-visible header
 * (heading + optional `summaryBelow`), so a fresh scan announces just the
 * concise summary; the expandable body lives outside the region and appears on
 * user action, so opening a card is never re-announced.
 */
export function ClashCard({
  heading,
  headingSecondary,
  summaryBelow,
  children,
  defaultOpen = false,
  live = true,
}: {
  heading: ReactNode;
  /** Optional muted second line under the heading (still part of the toggle). */
  headingSecondary?: ReactNode;
  /** Content kept visible under the heading in both states (e.g. people chips). */
  summaryBelow?: ReactNode;
  /** The full report detail — shown only while expanded. */
  children: ReactNode;
  defaultOpen?: boolean;
  live?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const regionId = useId();
  return (
    <Paper withBorder p="sm" style={{ borderColor: "var(--mantine-color-orange-4)" }}>
      <Box role={live ? "status" : undefined} aria-live={live ? "polite" : undefined}>
        <Group gap="sm" align="flex-start" wrap="nowrap">
          <IconAlertTriangle
            size={18}
            style={{ flexShrink: 0, marginTop: 2 }}
            color="var(--mantine-color-orange-6)"
            aria-hidden
          />
          <Stack gap={6} style={{ flexGrow: 1, minWidth: 0 }}>
            <UnstyledButton
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-controls={regionId}
              style={{ width: "100%", textAlign: "left" }}
            >
              <Group justify="space-between" align="flex-start" gap="xs" wrap="nowrap">
                <Stack gap={2} style={{ flexGrow: 1, minWidth: 0 }}>
                  <Text
                    size="sm"
                    fw={500}
                    c="orange.8"
                    style={{ overflowWrap: "anywhere" }}
                  >
                    {heading}
                  </Text>
                  {headingSecondary ? (
                    <Text size="xs" c="dimmed" style={{ overflowWrap: "anywhere" }}>
                      {headingSecondary}
                    </Text>
                  ) : null}
                </Stack>
                <IconChevronDown
                  size={16}
                  style={{
                    flexShrink: 0,
                    marginTop: 2,
                    transform: open ? "rotate(180deg)" : undefined,
                    transition: `transform ${MOTION.micro}ms ease`,
                  }}
                  aria-hidden
                />
              </Group>
            </UnstyledButton>
            {summaryBelow}
          </Stack>
        </Group>
      </Box>
      <Collapse expanded={open} id={regionId}>
        <Stack gap="sm" mt="xs">
          {children}
        </Stack>
      </Collapse>
    </Paper>
  );
}

/**
 * One conflicting/double-booking event inside an expanded clash card: title
 * (+ `External` badge), the human when-label · department line, and optional
 * per-entry content (e.g. the affected-people chips in the wizard panel).
 * When `href` is given the whole row is a link (the Double Booking page deep-
 * links to the event on the dashboard); without it the row is inert (the
 * wizard's advisory).
 */
export function ClashEventRow({
  entry,
  chips,
  href,
}: {
  entry: EventClashEntry;
  /** Extra per-entry content shown under the when-line. */
  chips?: ReactNode;
  /** Optional dashboard deep link; renders the row as a link when present. */
  href?: string;
}) {
  const when = clashWhenLabel(entry);
  const body = (
    <Stack gap={2}>
      <Group gap={6} wrap="wrap">
        <Text size="sm" fw={600} style={{ overflowWrap: "anywhere" }}>
          {entry.title}
        </Text>
        {entry.external && (
          <Badge size="xs" variant="light" color="gray">
            External
          </Badge>
        )}
      </Group>
      <Group gap={4} wrap="nowrap" align="center">
        <Text size="xs" c="dimmed" style={{ minWidth: 0, overflowWrap: "anywhere" }}>
          {when} · {entry.calendarName}
        </Text>
        {href ? (
          <IconChevronRight
            size={12}
            style={{ flexShrink: 0 }}
            color="var(--mantine-color-dimmed)"
            aria-hidden
          />
        ) : null}
      </Group>
      {chips && <Box mt={2}>{chips}</Box>}
    </Stack>
  );
  if (!href) {
    return body;
  }
  return (
    <UnstyledButton
      component={Link}
      href={href}
      aria-label={`Open ${entry.title} — ${when}`}
      style={{ display: "block", width: "100%", textAlign: "left" }}
    >
      {body}
    </UnstyledButton>
  );
}
