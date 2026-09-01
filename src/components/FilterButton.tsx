"use client";

import { ActionIcon, Badge, Box } from "@mantine/core";
import { IconFilter } from "@tabler/icons-react";

interface FilterButtonProps {
  activeCount: number;
  onClick: () => void;
  /** Icon button size in px (nav-row controls use 36; table toolbars 43). */
  size?: number;
}

/**
 * Trigger button for the filter dialog. Shows the number of active filter
 * groups as a badge when any filter is applied.
 */
export function FilterButton({ activeCount, onClick, size = 43 }: FilterButtonProps) {
  return (
    <Box pos="relative">
      <ActionIcon
        size={size}
        variant="default"
        aria-label={activeCount > 0 ? `Filters (${activeCount} active)` : "Filters"}
        onClick={onClick}
      >
        <IconFilter size={16} />
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
