"use client";

import type { Ref } from "react";
import {
  ActionIcon,
  Affix,
  Box,
  Button,
  Divider,
  Group,
  Text,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import { IconChevronUp, IconCopy, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";

import { eventDraftPresentation, type EventDraftKind } from "@/lib/events/draft";

interface EventDraftBarProps {
  kind: EventDraftKind;
  /** Event title for edit/duplicate drafts (ignored for new events). */
  title?: string | null;
  /** Floating offset shared with the page's FAB row. */
  bottomOffset: string;
  onResume: () => void;
  onDiscard: () => void;
  resumeRef?: Ref<HTMLButtonElement>;
}

interface EventDraftChipProps {
  kind: EventDraftKind;
  /** Event title for edit/duplicate drafts (ignored for new events). */
  title?: string | null;
  /** Tight phones: drop the text and keep just the icon circle. */
  compact?: boolean;
  /** Room for the secondary detail line ("New event" / the event title) next to
   *  the heading. Dropped when the row's leftover space is too narrow. */
  detail?: boolean;
  /** Room for the discard circle beside the resume control. Dropped when the
   *  leftover is narrower than the chip's floor — discarding stays available in
   *  the resumed wizard's header. */
  discard?: boolean;
  onResume: () => void;
  onDiscard: () => void;
  resumeRef?: Ref<HTMLButtonElement>;
}

const KIND_ICONS = {
  create: IconPlus,
  edit: IconPencil,
  duplicate: IconCopy,
} as const;

/**
 * Standalone "minimized draft" bar — the desktop (`lg`+) dock: centred, capped at
 * 560px, near the bottom edge. Below `lg` the draft always docks as a chip inside
 * the floating FAB row instead. The whole left region resumes the wizard; the
 * trailing circle discards it (after the caller's confirmation). Frosted like the
 * mobile control pill so it reads as another floating surface rather than a
 * one-off bubble.
 */
export function EventDraftBar({
  kind,
  title,
  bottomOffset,
  onResume,
  onDiscard,
  resumeRef,
}: EventDraftBarProps) {
  const { heading, detail, ariaLabel } = eventDraftPresentation(kind, title);
  const Icon = KIND_ICONS[kind];

  return (
    <Affix
      className="c2-fab-cluster"
      position={{ bottom: bottomOffset, left: 16, right: 16 }}
      zIndex={100}
      style={{ pointerEvents: "none" }}
    >
      <Box
        className="c2-glass-surface c2-control-pill"
        maw={560}
        mx="auto"
        role="group"
        aria-label="Minimized event draft"
      >
        <Group gap={4} wrap="nowrap" align="center">
          <Button
            ref={resumeRef}
            variant="subtle"
            color="gray"
            radius="xl"
            h={44}
            px={8}
            onClick={onResume}
            aria-label={ariaLabel}
            style={{ flex: 1, minWidth: 0 }}
            styles={{ inner: { width: "100%" }, label: { width: "100%" }}}
          >
            <Group gap="xs" wrap="nowrap" align="center" style={{ minWidth: 0, width: "100%" }}>
              <ThemeIcon variant="light" color="accent" radius="xl" size={32} aria-hidden>
                <Icon size={18} />
              </ThemeIcon>
              <Box style={{ minWidth: 0, flex: 1, textAlign: "left" }}>
                <Text size="sm" fw={600} c="var(--mantine-color-text)" truncate>
                  {heading}
                </Text>
                <Text size="xs" c="dimmed" truncate>
                  {detail}
                </Text>
              </Box>
              <IconChevronUp size={18} aria-hidden style={{ flexShrink: 0 }} />
            </Group>
          </Button>

          <Divider orientation="vertical" h={28} />

          <Tooltip label="Discard draft" position="top">
            <ActionIcon
              radius="50%"
              size={44}
              variant="subtle"
              color="red"
              aria-label="Discard draft"
              onClick={onDiscard}
              style={{ flexShrink: 0 }}
            >
              <IconTrash size={20} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Box>
    </Affix>
  );
}

/**
 * Mobile draft chip: the minimized wizard docks **inside** the floating FAB row,
 * to the left of the period chevrons, flexing into whatever width the fixed 56px
 * controls leave. Because it lives in the row's own wrapper it rides the shared
 * `c2-chrome-hide-able` state — it fades/sinks with the pill and FAB row while
 * the user touches or scrolls the calendar and slides back with them. On phones
 * too narrow for even the icon-only chip, the New-event circle gives way to it
 * (see `createYielded` in `DashboardView`), so the chip never clips the row.
 */
export function EventDraftChip({
  kind,
  title,
  compact = false,
  detail = true,
  discard = true,
  onResume,
  onDiscard,
  resumeRef,
}: EventDraftChipProps) {
  const { heading, detail: detailText, ariaLabel } = eventDraftPresentation(kind, title);
  const Icon = KIND_ICONS[kind];

  return (
    <Box
      className="c2-glass-surface c2-control-pill c2-draft-chip"
      style={{
        flex: compact ? "0 0 auto" : 1,
        minWidth: 0,
        display: "flex",
        gap: 4,
        alignItems: "center",
        padding: compact ? "4px 6px" : undefined,
      }}
      role="group"
      aria-label="Minimized event draft"
    >
      <Button
        ref={resumeRef}
        variant="subtle"
        color="gray"
        radius={compact ? "50%" : "xl"}
        w={compact ? 44 : undefined}
        h={44}
        px={compact ? 0 : 8}
        onClick={onResume}
        aria-label={ariaLabel}
        style={{ flex: compact ? "0 0 auto" : 1, minWidth: 0 }}
        styles={compact ? undefined : { inner: { width: "100%" }, label: { width: "100%" }}}
      >
        {compact ? (
          <Icon size={20} />
        ) : (
          <Group gap="xs" wrap="nowrap" align="center" style={{ minWidth: 0, width: "100%" }}>
            <ThemeIcon variant="light" color="accent" radius="xl" size={32} aria-hidden>
              <Icon size={18} />
            </ThemeIcon>
            <Box style={{ minWidth: 0, flex: 1, textAlign: "left" }}>
              <Text size="sm" fw={600} c="var(--mantine-color-text)" truncate>
                {heading}
              </Text>
              {detail && (
                <Text size="xs" c="dimmed" truncate>
                  {detailText}
                </Text>
              )}
            </Box>
          </Group>
        )}
      </Button>

      {discard && (
        <Tooltip label="Discard draft" position="top">
          <ActionIcon
            radius="50%"
            size={compact ? 32 : 36}
            variant="subtle"
            color="red"
            aria-label="Discard draft"
            onClick={onDiscard}
            style={{ flexShrink: 0 }}
          >
            <IconTrash size={18} />
          </ActionIcon>
        </Tooltip>
      )}
    </Box>
  );
}
