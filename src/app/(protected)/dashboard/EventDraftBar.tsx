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

const KIND_ICONS = {
  create: IconPlus,
  edit: IconPencil,
  duplicate: IconCopy,
} as const;

/**
 * Persistent "minimized draft" bar docked above the bottom controls. The whole
 * left region resumes the wizard; the trailing circle discards it (after the
 * caller's confirmation). Frosted like the mobile control pill so it reads as
 * another floating surface rather than a one-off bubble.
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
            styles={{ inner: { width: "100%" }, label: { width: "100%" } }}
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
