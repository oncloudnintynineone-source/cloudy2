"use client";

import { ActionIcon, Badge, Box } from "@mantine/core";
import { IconFilter } from "@tabler/icons-react";

interface FilterButtonProps {
  activeCount: number;
  onClick: () => void;
}

/**
 * Trigger button for the filter dialog. Shows the number of active filter
 * groups as a badge when any filter is applied.
 */
export function FilterButton({ activeCount, onClick }: FilterButtonProps) {
  return (
    <Box pos="relative">
      <ActionIcon size={43} variant="default" aria-label="Filters" onClick={onClick}>
        <IconFilter size={16} />
      </ActionIcon>
      {activeCount > 0 && (
        <Badge
          size="sm"
          variant="filled"
          radius="xl"
          pos="absolute"
          style={{ top: -4, right: -4 }}
        >
          {activeCount}
        </Badge>
      )}
    </Box>
  );
}
