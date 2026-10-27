"use client";

import { useState } from "react";
import { Badge, Group, Popover, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";

import { SelectableBadge } from "@/components/SelectableBadge";
import { useMotion } from "@/components/MotionProvider";
import { popoverTransitionProps } from "@/lib/motion/transitions";

export interface EventTypeGroupOption {
  value: string;
  label: string;
}

export interface EventTypeGroupSection {
  /** Stable identity across re-renders (the event-type group id). */
  id: string;
  label: string;
  /**
   * true = folder section (rendered as a chip whose popup holds the badges);
   * false = rendered directly as a labeled row of badges.
   */
  collapsible: boolean;
  options: EventTypeGroupOption[];
}

interface EventTypeGroupGridProps {
  /** Groups in display order (the "Ungrouped" catch-all last). */
  sections: EventTypeGroupSection[];
  isSelected: (value: string) => boolean;
  onToggle: (value: string) => void;
  /**
   * "single": selecting an option closes the popup (the wizard's one-type
   * picker). "multi": the popup stays open while several options are toggled
   * (the filter dialog).
   */
  mode: "single" | "multi";
}

/** Above the wizard/filter modals (200) so the popup never hides behind them. */
const POPOVER_Z_INDEX = 300;

/**
 * The event-type picker's grouped layout, shared by the wizard's type step and
 * the filter dialog's Event Types group. Groups flagged as folders render as
 * content-width chips whose popup holds that group's `SelectableBadge`s;
 * every other group renders directly as its own row — category label above,
 * badges below — so ordinary groups are never hidden behind an extra tap.
 * The inline rows come first, then the folder chips (the pure builder already
 * orders them that way).
 *
 * A lone non-folder section (e.g. an org with no groups at all) skips the
 * label row and renders the badges directly — no extra chrome when there is
 * nothing to chunk away.
 */
export function EventTypeGroupGrid({
  sections,
  isSelected,
  onToggle,
  mode,
}: EventTypeGroupGridProps) {
  if (sections.length === 0) {
    return null;
  }
  if (sections.length === 1 && !sections[0].collapsible) {
    return (
      <Group gap={6} wrap="wrap">
        {sections[0].options.map((option) => (
          <SelectableBadge
            key={option.value}
            label={option.label}
            selected={isSelected(option.value)}
            onToggle={() => onToggle(option.value)}
          />
        ))}
      </Group>
    );
  }
  const inlineSections = sections.filter((section) => !section.collapsible);
  const folderSections = sections.filter((section) => section.collapsible);
  return (
    <Stack gap="md">
      {inlineSections.length > 0 && (
        <Stack gap="sm">
          {inlineSections.map((section) => (
            <div key={section.id} role="group" aria-label={section.label}>
              <Text size="xs" fw={600} c="dimmed" mb={4}>
                {section.label}
              </Text>
              <Group gap={6} wrap="wrap">
                {section.options.map((option) => (
                  <SelectableBadge
                    key={option.value}
                    label={option.label}
                    selected={isSelected(option.value)}
                    onToggle={() => onToggle(option.value)}
                  />
                ))}
              </Group>
            </div>
          ))}
        </Stack>
      )}
      {folderSections.length > 0 && (
        <Group gap="xs" wrap="wrap">
          {folderSections.map((section) => (
            <GroupTile
              key={section.id}
              section={section}
              isSelected={isSelected}
              onToggle={onToggle}
              mode={mode}
            />
          ))}
        </Group>
      )}
    </Stack>
  );
}

/**
 * One group as a content-width container chip: a brand **outline** badge (the
 * type badges inside its popup are borderless light/filled, so the container
 * and its options never read the same) with the group name and a right-edge
 * chevron that rotates with the popup. A light-brand fill appears once the
 * group holds a selection (counts stay off the chip; the `aria-label` carries
 * them).
 */
function GroupTile({
  section,
  isSelected,
  onToggle,
  mode,
}: {
  section: EventTypeGroupSection;
  isSelected: (value: string) => boolean;
  onToggle: (value: string) => void;
  mode: EventTypeGroupGridProps["mode"];
}) {
  const motion = useMotion();
  const [open, setOpen] = useState(false);
  const selectedCount = section.options.reduce(
    (count, option) => count + (isSelected(option.value) ? 1 : 0),
    0,
  );

  function handleToggle(value: string) {
    onToggle(value);
    if (mode === "single") {
      setOpen(false);
    }
  }

  return (
    <Popover
      opened={open}
      onChange={setOpen}
      position="bottom"
      withArrow
      shadow="md"
      radius="md"
      zIndex={POPOVER_Z_INDEX}
      transitionProps={popoverTransitionProps(motion)}
    >
      <Popover.Target>
        <UnstyledButton
          onClick={() => setOpen((prev) => !prev)}
          aria-haspopup="true"
          aria-expanded={open}
          aria-label={`${section.label}, ${section.options.length} type${
            section.options.length === 1 ? "" : "s"
          }${selectedCount > 0 ? `, ${selectedCount} selected` : ""}`}
          style={{
            cursor: "pointer",
            borderRadius: "var(--mantine-radius-md)",
            maxWidth: "100%",
          }}
        >
          <Badge
            size="lg"
            variant="outline"
            aria-hidden
            style={{
              gap: 6,
              height: "auto",
              minHeight: "calc(var(--badge-height-lg) * 1.5)",
              paddingBlock: 4,
              maxWidth: "100%",
              ...(selectedCount > 0
                ? { backgroundColor: "var(--mantine-color-brand-light)" }
                : undefined),
            }}
          >
            <span
              style={{
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {section.label}
            </span>
            <IconChevronDown
              size={14}
              style={{
                flexShrink: 0,
                transform: open ? "rotate(180deg)" : undefined,
                transition: `transform ${motion.duration.micro}ms ${motion.easing.out}`,
              }}
            />
          </Badge>
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown aria-label={`${section.label} options`}>
        <Group gap={6} wrap="wrap" maw={280}>
          {section.options.map((option) => (
            <SelectableBadge
              key={option.value}
              label={option.label}
              selected={isSelected(option.value)}
              onToggle={() => handleToggle(option.value)}
            />
          ))}
        </Group>
      </Popover.Dropdown>
    </Popover>
  );
}
