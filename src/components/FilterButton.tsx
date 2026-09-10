"use client";

import type { MouseEvent } from "react";
import { ActionIcon, Badge, Box } from "@mantine/core";
import { IconFilter } from "@tabler/icons-react";

interface FilterButtonProps {
  activeCount: number;
  /** Receives the click event so callers can capture the trigger's rect for the
   *  modal's zoom-from-element animation. */
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  /** Icon button size in px (nav-row controls use 36; table toolbars 43). */
  size?: number;
  /** Icon glyph size in px (the dashboard's 36px nav row uses 18 to match its
   *  sibling chevrons; table toolbars keep the default 16). */
  iconSize?: number;
}

/**
 * Trigger button for the filter dialog. Shows the number of active filter
 * groups as a badge when any filter is applied.
 */
export function FilterButton({
  activeCount,
  onClick,
  size = 43,
  iconSize = 16,
}: FilterButtonProps) {
  return (
    <Box pos="relative">
      <ActionIcon
        size={size}
        variant="default"
        aria-label={activeCount > 0 ? `Filters (${activeCount} active)` : "Filters"}
        onClick={onClick}
      >
        <IconFilter size={iconSize} />
      </ActionIcon>
      {activeCount > 0 && (
        <Badge
          size="sm"
          variant="filled"
          radius="xl"
          pos="absolute"
          style={{ top: -4, right: -4 }}
          aria-hidden
        >
          {activeCount}
        </Badge>
      )}
    </Box>
  );
}
