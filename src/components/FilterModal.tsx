"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Button,
  Chip,
  Group,
  Modal,
  MultiSelect,
  Stack,
  Text,
} from "@mantine/core";

import {
  isGroupUnfiltered,
  resolveFilterApply,
  type FilterApplyGroup,
} from "@/lib/filters/resolveFilterApply";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterGroupAction {
  label: string;
  icon?: ReactNode;
  /** True when the quick action is currently active (drives the button styling). */
  isApplied: (selected: string[]) => boolean;
  /** Called on click with this group's draft value setter and current values. */
  apply: (
    setValues: (values: string[]) => void,
    context: { selected: string[]; allValues: string[] },
  ) => void;
}

export interface FilterGroup {
  label: string;
  options: FilterOption[];
  /** Optional quick action rendered beside the group label (e.g. "only me"). */
  action?: FilterGroupAction;
  /**
   * "grid" (default) renders the options as toggleable chip pills. "search"
   * renders a searchable dropdown (MultiSelect) for large option lists. Search
   * groups use "empty = no filter" semantics, so narrowing 100 options down to
   * a few never requires unticking the rest.
   */
  variant?: "grid" | "search";
}

interface FilterModalProps {
  opened: boolean;
  onClose: () => void;
  title: string;
  groups: FilterGroup[];
  values: Record<string, string[]>;
  onApply: (values: Record<string, string[]>) => void;
}

function allOptionValues(group: FilterGroup): string[] {
  return group.options.map((option) => option.value);
}

function toApplyGroup(group: FilterGroup): FilterApplyGroup {
  return { label: group.label, optionCount: group.options.length, variant: group.variant };
}

/**
 * Build the initial draft selection for the dialog: a grid group with no applied
 * filter shows every option selected ("all selected" = no filter); a search group
 * with no applied filter shows nothing selected ("empty" = no filter). Otherwise
 * the draft mirrors the applied subset.
 */
function initialDraft(
  groups: FilterGroup[],
  values: Record<string, string[]>,
): Record<string, string[]> {
  return Object.fromEntries(
    groups.map((group) =>
      group.variant === "search"
        ? [group.label, values[group.label] ?? []]
        : [
            group.label,
            values[group.label]?.length ? values[group.label] : allOptionValues(group),
          ],
    ),
  );
}

/**
 * Reusable filter dialog: opens from a trigger button and presents each filter
 * group either as a row of toggleable chip pills (default) or as a searchable
 * dropdown (variant "search", for large option lists). Selections are staged in a draft and only applied when "Apply" is pressed. The draft
 * lives in a child that mounts with the modal, so it re-initializes from the
 * current applied values every time the dialog opens. "No filter applied" is
 * "all selected" in grid groups and "nothing selected" in search groups.
 */
export function FilterModal({ opened, onClose, title, groups, values, onApply }: FilterModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title={title} centered size="sm">
      <FilterModalBody groups={groups} values={values} onApply={onApply} onClose={onClose} />
    </Modal>
  );
}

function FilterModalBody({
  groups,
  values,
  onApply,
  onClose,
}: Pick<FilterModalProps, "groups" | "values" | "onApply" | "onClose">) {
  const [draft, setDraft] = useState<Record<string, string[]>>(() =>
    initialDraft(groups, values),
  );
  // Grid groups the user edited (apply their draft explicitly — including a
  // full selection) and whether "Clear" was pressed (apply nothing, restoring
  // the consumer's default). Untouched grid groups re-apply their current
  // values, so re-opening the dialog and pressing Apply keeps an existing
  // filter. Search groups ignore both and keep empty = no filter.
  const [changed, setChanged] = useState<ReadonlySet<string>>(() => new Set());
  const [cleared, setCleared] = useState(false);

  const searchLabels = useMemo(
    () => new Set(groups.filter((group) => group.variant === "search").map((g) => g.label)),
    [groups],
  );

  function handleGroupChange(key: string, value: string[]) {
    setDraft((prev) => ({
      ...prev,
      // Grid groups keep the old no-clear guard (empty = everything hidden).
      // Search groups treat empty as "no filter", so allow it through.
      [key]: !searchLabels.has(key) && value.length === 0 ? prev[key] : value,
    }));
    setChanged((prev) => new Set(prev).add(key));
    setCleared(false);
  }

  function handleApply() {
    onApply(resolveFilterApply(groups.map(toApplyGroup), draft, values, changed, cleared));
    onClose();
  }

  function handleClear() {
    setDraft(initialDraft(groups, {}));
    setChanged(new Set());
    setCleared(true);
  }

  const hasActiveFilter = groups.some(
    (group) => !isGroupUnfiltered(toApplyGroup(group), draft[group.label] ?? []),
  );

  return (
    <Stack>
      {groups.map((group) => (
        <div key={group.label}>
          <Group justify="space-between" align="center" gap="xs">
            <Text fw={600} size="sm">
              {group.label}
            </Text>
            {group.action && (
              <Button
                size="xs"
                variant={group.action.isApplied(draft[group.label] ?? []) ? "light" : "default"}
                color="accent"
                leftSection={group.action.icon}
                onClick={() =>
                  group.action?.apply(
                    (values) => handleGroupChange(group.label, values),
                    {
                      selected: draft[group.label] ?? [],
                      allValues: allOptionValues(group),
                    },
                  )
                }
              >
                {group.action.label}
              </Button>
            )}
          </Group>
          {group.variant === "search" ? (
            <MultiSelect
              mt="xs"
              value={draft[group.label] ?? []}
              onChange={(value) => handleGroupChange(group.label, value)}
              data={group.options}
              searchable
              clearable
              placeholder={`All ${group.label.toLowerCase()}`}
              nothingFoundMessage={`No ${group.label.toLowerCase()} found`}
            />
          ) : (
            <Chip.Group
              multiple
              value={draft[group.label] ?? []}
              onChange={(value) => handleGroupChange(group.label, value)}
            >
              <Group gap="xs" mt="xs">
                {group.options.map((option) => (
                  <Chip key={option.value} value={option.value} color="accent">
                    {option.label}
                  </Chip>
                ))}
              </Group>
            </Chip.Group>
          )}
        </div>
      ))}

      <Group justify="space-between" mt="md" wrap="wrap">
        <Button variant="subtle" color="gray" onClick={handleClear} disabled={!hasActiveFilter}>
          Clear
        </Button>
        <Group gap="xs">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleApply}>Apply</Button>
        </Group>
      </Group>
    </Stack>
  );
}
