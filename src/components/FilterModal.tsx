"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Badge, Button, Chip, Group, Modal, Stack, Text, useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconPlus } from "@tabler/icons-react";

import { UserSelectModal } from "@/components/UserSelectModal";
import {
  isGroupUnfiltered,
  resolveFilterApply,
  type FilterApplyGroup,
} from "@/lib/filters/resolveFilterApply";
import { buildUserGroups, type PickerGroup } from "@/lib/users/userSelect";

export interface FilterOption {
  value: string;
  label: string;
  /** Optional case-insensitive search terms beyond the label. */
  search?: string;
  /**
   * Department (grouping) name for search-variant groups: when present, the
   * picker dialog shows one badge section per department instead of one flat
   * list. Absent (undefined) = flat section.
   */
  department?: string | null;
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
  /** Optional quick action rendered beside the group label (e.g. "My Events"). */
  action?: FilterGroupAction;
  /**
   * "grid" (default) renders the options as toggleable chip pills. "search"
   * renders a badge picker dialog (UserSelectModal) for large option lists:
   * the currently selected options appear as badges beside a Select trigger,
   * and the dialog filters them by a search box. Search groups use "empty =
   * no filter" semantics, so narrowing 100 options down to a few never
   * requires unticking the rest.
   */
  variant?: "grid" | "search";
}

/**
 * Build the picker sections for a search-variant group: when the options carry
 * department names, one section per department (No department last),
 * otherwise a single flat section carrying the group label.
 */
function searchGroupPickerGroups(group: FilterGroup): PickerGroup[] {
  if (group.options.some((option) => option.department !== undefined)) {
    return buildUserGroups(
      group.options.map((option) => ({
        id: option.value,
        label: option.label,
        department: option.department ?? null,
        search: option.search,
      })),
    );
  }
  return [
    {
      label: group.label,
      options: group.options.map((option) => ({
        id: option.value,
        label: option.label,
        search: option.search,
      })),
    },
  ];
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
        : [group.label, values[group.label]?.length ? values[group.label] : allOptionValues(group)],
    ),
  );
}

/**
 * Reusable filter dialog: opens from a trigger button and presents each filter
 * group either as a row of toggleable chip pills (default) or as a selected-badge
 * summary + Select trigger that opens the UserSelectModal badge picker (variant
 * "search", for large option lists). Selections are staged in a draft and only
 * applied when "Apply" is pressed. The draft lives in a child that mounts with
 * the modal, so it re-initializes from the current applied values every time the
 * dialog opens. "No filter applied" is "all selected" in grid groups and
 * "nothing selected" in search groups.
 */
export function FilterModal({ opened, onClose, title, groups, values, onApply }: FilterModalProps) {
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  return (
    <Modal opened={opened} onClose={onClose} title={title} centered size={isDesktop ? "md" : "sm"}>
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
  const [draft, setDraft] = useState<Record<string, string[]>>(() => initialDraft(groups, values));
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

  // The open state of the search-group picker is kept separate from its
  // content, so the closing animation plays over the same sections/dialog it
  // opened instead of blanking mid-transition.
  const [pickerContent, setPickerContent] = useState<{
    label: string;
    groups: PickerGroup[];
    values: Record<string, string[]>;
  } | null>(null);
  const [pickerOpened, setPickerOpened] = useState(false);

  function openPicker(group: FilterGroup) {
    setPickerContent({
      label: group.label,
      groups: searchGroupPickerGroups(group),
      values: { [group.label]: draft[group.label] ?? [] },
    });
    setPickerOpened(true);
  }

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
                color="brand"
                leftSection={group.action.icon}
                onClick={() =>
                  group.action?.apply((values) => handleGroupChange(group.label, values), {
                    selected: draft[group.label] ?? [],
                    allValues: allOptionValues(group),
                  })
                }
              >
                {group.action.label}
              </Button>
            )}
          </Group>
          {group.variant === "search" ? (
            <Group justify="space-between" align="center" gap="xs" mt="xs" wrap="wrap">
              {(draft[group.label] ?? []).length > 0 ? (
                <Group gap={4} wrap="wrap" grow>
                  {(draft[group.label] ?? [])
                    .map((value) => group.options.find((option) => option.value === value))
                    .filter((option): option is FilterOption => option !== undefined)
                    .map((option) => (
                      <Badge key={option.value} variant="light" size="sm">
                        {option.label}
                      </Badge>
                    ))}
                </Group>
              ) : (
                <Text size="xs" c="dimmed">
                  All {group.label.toLowerCase()}
                </Text>
              )}
              <Button
                size="xs"
                variant="light"
                leftSection={<IconPlus size={14} />}
                onClick={() => openPicker(group)}
              >
                Select
              </Button>
            </Group>
          ) : (
            <Chip.Group
              multiple
              value={draft[group.label] ?? []}
              onChange={(value) => handleGroupChange(group.label, value)}
            >
              <Group gap="xs" mt="xs">
                {group.options.map((option) => (
                  <Chip key={option.value} value={option.value} color="brand">
                    {option.label}
                  </Chip>
                ))}
              </Group>
            </Chip.Group>
          )}
        </div>
      ))}

      <UserSelectModal
        opened={pickerOpened}
        onClose={() => setPickerOpened(false)}
        groups={pickerContent?.groups ?? []}
        values={pickerContent?.values ?? {}}
        onConfirm={(values) => {
          if (pickerContent) {
            handleGroupChange(pickerContent.label, values[pickerContent.label] ?? []);
          }
          setPickerOpened(false);
        }}
        confirmLabel="Apply"
        zIndex={200}
      />

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
