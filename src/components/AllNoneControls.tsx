"use client";

import { Button, Group } from "@mantine/core";

export interface AllNoneControlsProps {
  /** Accessible context: "Select all <label>" / "Clear <label>". */
  label: string;
  allSelected: boolean;
  noneSelected: boolean;
  onAll: () => void;
  onNone: () => void;
  /** Search groups say "Clear": empty means "no filter", not "hide all". */
  noneLabel?: string;
}

/**
 * Compact All / None pair shared by filter groups, grouped sections and the
 * badge picker. Both buttons disable at their bound so the control always
 * reflects whether an action would change anything.
 */
export function AllNoneControls({
  label,
  allSelected,
  noneSelected,
  onAll,
  onNone,
  noneLabel = "None",
}: AllNoneControlsProps) {
  return (
    <Group gap={2} wrap="nowrap">
      <Button
        size="xs"
        variant="subtle"
        color="gray"
        px={6}
        onClick={onAll}
        disabled={allSelected}
        aria-label={`Select all ${label}`}
      >
        All
      </Button>
      <Button
        size="xs"
        variant="subtle"
        color="gray"
        px={6}
        onClick={onNone}
        disabled={noneSelected}
        aria-label={`Clear ${label}`}
      >
        {noneLabel}
      </Button>
    </Group>
  );
}
