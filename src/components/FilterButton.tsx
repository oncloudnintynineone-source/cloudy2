"use client";

import { Badge, Button } from "@mantine/core";
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
    <Button
      variant="default"
      leftSection={<IconFilter size={16} />}
      rightSection={
        activeCount > 0 ? (
          <Badge size="sm" variant="filled" radius="xl">
            {activeCount}
          </Badge>
        ) : undefined
      }
      onClick={onClick}
    >
      Filters
    </Button>
  );
}
