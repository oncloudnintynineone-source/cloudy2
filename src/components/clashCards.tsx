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
import {
  IconAlertTriangle,
  IconCalendarEvent,
  IconChevronDown,
  IconEye,
  IconPencil,
} from "@tabler/icons-react";

import { clashEntryTimeLabel, clashTypeLabel, clashWhenLabel } from "@/lib/events/clashDisplay";
import type { EventClashEntry } from "@/lib/events/clashActions";
import type { Rect } from "@/lib/motion/origin";
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
  visual,
  summaryBelow,
  children,
  defaultOpen = false,
  live = true,
}: {
  heading: ReactNode;
  /** Optional muted second line under the heading (still part of the toggle). */
  headingSecondary?: ReactNode;
  /** Always-visible visual (e.g. the conflict timeline), above the summary. */
  visual?: ReactNode;
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
      <Group gap="sm" align="flex-start" wrap="nowrap">
        <IconAlertTriangle
          size={18}
          style={{ flexShrink: 0, marginTop: 2 }}
          color="var(--mantine-color-orange-6)"
          aria-hidden
        />
        <Stack gap={6} style={{ flexGrow: 1, minWidth: 0 }}>
          {/* The live region stays scoped to the concise heading, so a fresh
              scan announces the count, not the visual or the expandable body. */}
          <Box role={live ? "status" : undefined} aria-live={live ? "polite" : undefined}>
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
          </Box>
          {visual}
          {summaryBelow}
        </Stack>
      </Group>
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
  onOpen,
  typeFirst = false,
}: {
  entry: EventClashEntry;
  /** Extra per-entry content shown under the when-line. */
  chips?: ReactNode;
  /** Optional dashboard deep link; renders the row as a link when present. */
  href?: string;
  /** Optional in-place open handler (detail modal); takes precedence over `href`. */
  onOpen?: (rect: Rect) => void;
  /**
   * Lead with the event type shortname and demote the stored composite title to
   * a muted second line (the Double Booking page). Default keeps the stored
   * title primary (the wizard's advisory).
   */
  typeFirst?: boolean;
}) {
  const primary = typeFirst ? (entry.displayLabel ?? clashTypeLabel(entry)) : entry.title;
  const secondary = typeFirst && entry.title !== primary ? entry.title : null;
  const when = typeFirst ? clashEntryTimeLabel(entry) : clashWhenLabel(entry);
  const body = (
    <Stack gap={2} style={{ flexGrow: 1, minWidth: 0 }}>
      <Group gap={6} wrap="wrap">
        <Text size="sm" fw={600} style={{ overflowWrap: "anywhere" }}>
          {primary}
        </Text>
        {entry.external && (
          <Badge size="xs" variant="light" color="gray">
            External
          </Badge>
        )}
      </Group>
      {secondary ? (
        <Text size="xs" c="dimmed" style={{ overflowWrap: "anywhere" }}>
          {secondary}
        </Text>
      ) : null}
      <Text size="xs" c="dimmed" style={{ overflowWrap: "anywhere" }}>
        {when} · {entry.calendarName}
      </Text>
      {chips && <Box mt={2}>{chips}</Box>}
    </Stack>
  );
  if (onOpen) {
    return (
      <UnstyledButton
        type="button"
        onClick={(e) => onOpen(e.currentTarget.getBoundingClientRect())}
        className="c2-clash-row"
        aria-label={`View details for ${primary} — ${when}`}
      >
        <Group gap="xs" wrap="nowrap" align="flex-start" justify="space-between">
          {body}
          <Group gap={4} wrap="nowrap" align="center" style={{ flexShrink: 0, marginTop: 1 }}>
            <IconEye size={14} color="var(--mantine-color-orange-7)" aria-hidden />
            <Text size="xs" fw={600} c="orange.7" aria-hidden>
              View
            </Text>
          </Group>
        </Group>
      </UnstyledButton>
    );
  }
  if (!href) {
    return body;
  }
  // An external event has no detail to open, so the link falls back to its day
  // and the affordance says so rather than implying an edit.
  const isDayLink = entry.eventId === null;
  return (
    <UnstyledButton
      component={Link}
      href={href}
      className="c2-clash-row"
      aria-label={`${isDayLink ? "Open day for" : "Open"} ${entry.title} — ${when}`}
    >
      <Group gap="xs" wrap="nowrap" align="flex-start" justify="space-between">
        {body}
        <Group gap={4} wrap="nowrap" align="center" style={{ flexShrink: 0, marginTop: 1 }}>
          {isDayLink ? (
            <IconCalendarEvent size={14} color="var(--mantine-color-orange-7)" aria-hidden />
          ) : (
            <IconPencil size={14} color="var(--mantine-color-orange-7)" aria-hidden />
          )}
          <Text size="xs" fw={600} c="orange.7" aria-hidden>
            {isDayLink ? "Open day" : "Open"}
          </Text>
        </Group>
      </Group>
    </UnstyledButton>
  );
}
