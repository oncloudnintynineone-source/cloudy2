"use client";

import { useState } from "react";
import { Badge, Group, Popover, SimpleGrid, Text, UnstyledButton } from "@mantine/core";

import { SelectableBadge } from "@/components/SelectableBadge";

export interface EventTypeGroupOption {
  value: string;
  label: string;
}

export interface EventTypeGroupSection {
  /** Stable identity across re-renders (the event-type group id). */
  id: string;
  label: string;
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
 * The event-type picker's grid layout, shared by the wizard's type step and
 * the filter dialog's Event Types group: one tile per group; tapping a tile
 * opens a popup with that group's `SelectableBadge`s. This keeps the whole
 * picker one compact grid instead of a long stack of expanded sections.
 * A single section (e.g. an org with no groups at all) skips the tile + popup
 * and renders the badges directly — no extra tap when there is nothing to
 * chunk away.
 */
export function EventTypeGroupGrid({ sections, isSelected, onToggle, mode }: EventTypeGroupGridProps) {
  if (sections.length === 0) {
    return null;
  }
  if (sections.length === 1) {
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
  return (
    <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="xs" verticalSpacing="xs">
      {sections.map((section) => (
        <GroupTile
          key={section.id}
          section={section}
          isSelected={isSelected}
          onToggle={onToggle}
          mode={mode}
        />
      ))}
    </SimpleGrid>
  );
}

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
            display: "block",
            width: "100%",
            padding: "var(--mantine-spacing-sm)",
            borderRadius: "var(--mantine-radius-md)",
            border: `1px solid ${
              selectedCount > 0 ? "var(--mantine-color-brand-6)" : "var(--mantine-color-gray-3)"
            }`,
            background: selectedCount > 0 ? "var(--mantine-color-brand-0)" : undefined,
            cursor: "pointer",
          }}
        >
          <Group gap={6} wrap="nowrap" justify="space-between">
            <Text size="sm" fw={600} truncate>
              {section.label}
            </Text>
            <Group gap={4} wrap="nowrap">
              {selectedCount > 0 && (
                <Badge size="sm" variant="filled" color="accent" aria-hidden>
                  {selectedCount}
                </Badge>
              )}
              <Badge size="sm" variant="light" color="gray" aria-hidden>
                {section.options.length}
              </Badge>
            </Group>
          </Group>
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
