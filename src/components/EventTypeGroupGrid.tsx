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
}

/** Above the wizard modal (200) so the folder popup never hides behind it. */
const POPOVER_Z_INDEX = 300;

/**
 * The wizard's type step: a **single**-select event-type picker. Groups flagged
 * as folders render as content-width chips whose popup holds that group's
 * `SelectableBadge`s (tapping a type picks it and closes the popup); every
 * other group renders directly as its own row — category label above, badges
 * below — so ordinary groups are never hidden behind an extra tap. The inline
 * rows come first, then the folder chips (the pure builder already orders them
 * that way).
 *
 * A lone non-folder section (e.g. an org with no groups at all) skips the
 * label row and renders the badges directly — no extra chrome when there is
 * nothing to chunk away.
 *
 * The filter dialog no longer renders through here: a multi-select group needs
 * counts and rows, not chips whose state is a border (docs/dashboard-views.md
 * §1.2), and its own panel owns that now.
 */
export function EventTypeGroupGrid({
  sections,
  isSelected,
  onToggle,
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
 * chevron that rotates with the popup. The **border itself** carries the
 * selection state — none: plain outline; **some**: **dotted yellow** outline;
 * **all**: **solid yellow** outline (`.c2-event-type-group-tile[data-selected]`
 * / `[data-partial]` in `globals.css`). No glyph, no count badge, no fill: a
 * folder that looks untouched while it holds a selection is what made people
 * re-pick types they had already filtered, and the dash/color says it at a
 * glance. The `aria-label` spells the count out for assistive tech. (The filter
 * dialog no longer uses this layout: there, a folder holds several picks and a
 * border was the only cue — see docs/dashboard-views.md §1.2.)
 */
function GroupTile({
  section,
  isSelected,
  onToggle,
}: {
  section: EventTypeGroupSection;
  isSelected: (value: string) => boolean;
  onToggle: (value: string) => void;
}) {
  const motion = useMotion();
  const [open, setOpen] = useState(false);
  const selectedCount = section.options.reduce(
    (count, option) => count + (isSelected(option.value) ? 1 : 0),
    0,
  );
  const allSelected = selectedCount > 0 && selectedCount === section.options.length;

  function handleToggle(value: string) {
    onToggle(value);
    // Single-select: the pick is made, so the popup gets out of the way.
    setOpen(false);
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
          }${allSelected ? ", all selected" : selectedCount > 0 ? `, ${selectedCount} selected` : ""}`}
          style={{
            cursor: "pointer",
            borderRadius: "var(--mantine-radius-md)",
            maxWidth: "100%",
          }}
        >
          <Badge
            size="lg"
            variant="outline"
            className="c2-event-type-group-tile"
            data-selected={selectedCount > 0 ? "true" : undefined}
            data-partial={selectedCount > 0 && !allSelected ? "true" : undefined}
            aria-hidden
            style={{
              gap: 6,
              height: "auto",
              minHeight: "var(--c2-chip-height)",
              paddingBlock: 4,
              maxWidth: "100%",
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
