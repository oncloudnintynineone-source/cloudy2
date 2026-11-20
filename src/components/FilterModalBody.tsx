"use client";

import { useMemo, useState } from "react";
import { ActionIcon, Badge, Box, Button, Group, Stack, Text, TextInput } from "@mantine/core";
import { IconChevronDown, IconSearch, IconX } from "@tabler/icons-react";

import { AllNoneControls } from "@/components/AllNoneControls";
import { EventTypeGroupGrid } from "@/components/EventTypeGroupGrid";
import { PickerBadges, PickerTrigger, type PickerBadgeItem } from "@/components/PickerField";
import { SelectableBadge } from "@/components/SelectableBadge";
import { UserSelectModal } from "@/components/UserSelectModal";
import {
  groupFilterState,
  isGroupUnfiltered,
  resolveFilterApply,
  type FilterApplyGroup,
  type GroupFilterState,
} from "@/lib/filters/resolveFilterApply";
import { useMotion } from "@/components/MotionProvider";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { buildUserGroups, type PickerGroup } from "@/lib/users/userSelect";

import type { FilterGroup, FilterModalProps, FilterOption } from "./FilterModal";

/** Fallback cap for an optional free-text filter (callers may override). */
const DEFAULT_TEXT_FILTER_MAX_LENGTH = 120;

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
        departmentSort: option.departmentSort ?? null,
        departmentId: option.departmentId ?? null,
        departmentParentId: option.departmentParentId ?? null,
        search: option.search,
        self: option.self,
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
        self: option.self,
      })),
    },
  ];
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

interface FilterGroupHeaderProps {
  group: FilterGroup;
  /** The group's current draft, so the quick action can report its own state. */
  selected: readonly string[];
  /** Live selection state, shown as the state chip beside the label. */
  state: GroupFilterState;
  /** Collapsed groups keep their header and hide everything below it. */
  collapsible: boolean;
  shown: boolean;
  onToggleExpanded: () => void;
  onAll: () => void;
  onNone: () => void;
  onAction: () => void;
}

/**
 * One filter group's header — the same recipe for every group kind: label, the
 * state chip ("All" / "None" / "3 of 12"), Show/Hide for a collapsed group, the
 * group-level All/None pair, then the optional quick action. The three group
 * kinds used to arrange these differently (the sectioned group hid its count in
 * a gray badge, the search group had no count at all), which is what made the
 * dialog read as three different dialogs. The chip is deliberately **not**
 * `aria-hidden`: read after the label it is the group's state ("Users, 3 of 12").
 */
function FilterGroupHeader({
  group,
  selected,
  state,
  collapsible,
  shown,
  onToggleExpanded,
  onAll,
  onNone,
  onAction,
}: FilterGroupHeaderProps) {
  const motion = useMotion();
  const isSearch = group.variant === "search";
  return (
    <Group justify="space-between" align="center" gap="xs" wrap="wrap">
      <Group gap="xs" align="center" wrap="nowrap" style={{ minWidth: 0 }}>
        <Text fw={600} size="sm" truncate>
          {group.label}
        </Text>
        <Badge
          size="xs"
          variant="light"
          color={state.active ? "accent" : "gray"}
          title={state.active ? `Filtered: ${state.label}` : `No filter: ${state.label}`}
        >
          {state.label}
        </Badge>
      </Group>
      <Group gap={4} align="center" wrap="wrap">
        {collapsible && (
          <Button
            size="xs"
            variant="subtle"
            color="gray"
            rightSection={
              <IconChevronDown
                size={14}
                style={{
                  transform: shown ? "rotate(180deg)" : undefined,
                  transition: `transform ${motion.duration.micro}ms ${motion.easing.out}`,
                }}
              />
            }
            aria-expanded={shown}
            onClick={onToggleExpanded}
          >
            {shown ? "Hide" : "Show"}
          </Button>
        )}
        {shown && (
          <>
            {/* Group-level pair: "None" is a real selection (an empty grid) for a
                grid group, "Clear" is the absence of one for a search group — the
                footer's "Reset filters" is a third thing and keeps its own name. */}
            <AllNoneControls
              label={group.label}
              allSelected={state.kind === "all"}
              noneSelected={state.kind === "none"}
              noneLabel={isSearch ? "Clear" : "None"}
              onAll={onAll}
              onNone={onNone}
            />
            {group.action && (
              <Button
                size="xs"
                variant="light"
                color="brand"
                leftSection={group.action.icon}
                aria-pressed={group.action.isApplied([...selected])}
                onClick={onAction}
              >
                {group.action.label}
              </Button>
            )}
          </>
        )}
      </Group>
    </Group>
  );
}

/**
 * The filter dialog's body: staged selections, the optional free-text field,
 * collapsed groups, and the search-group badge picker. Every group — flat grid,
 * sectioned grid, or search — is introduced by the same {@link FilterGroupHeader}
 * and summarized by the same removable chips. Split into its own chunk so the
 * modal chrome can animate out of the trigger before {@link FilterModal} finishes
 * loading this body (docs/loading-transitions.md §1.15.1).
 */
export function FilterModalBody({
  groups,
  values,
  onApply,
  textFilter,
  onClose,
  collapsedGroupLabels = [],
  hint,
}: Pick<
  FilterModalProps,
  "groups" | "values" | "onApply" | "textFilter" | "onClose" | "collapsedGroupLabels" | "hint"
>) {
  const [draft, setDraft] = useState<Record<string, string[]>>(() => initialDraft(groups, values));
  // Free-text filter draft; blank means "no text filter". Staged like the
  // groups and only applied on Apply.
  const [textDraft, setTextDraft] = useState<string>(() => textFilter?.value ?? "");
  // Collapsed groups start hidden and expand per-group; the toggle is local
  // to the dialog session (re-opening resets to the collapsed start).
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  // Grid groups the user edited (apply their draft explicitly — including a
  // full selection) and whether "Reset filters" was pressed (apply nothing,
  // restoring the consumer's default). Untouched grid groups re-apply their
  // current values, so re-opening the dialog and pressing Apply keeps an
  // existing filter. Search groups ignore both and keep empty = no filter.
  const [changed, setChanged] = useState<ReadonlySet<string>>(() => new Set());
  const [cleared, setCleared] = useState(false);
  // Kept up through an async `onApply` (a server write) so the button shows a
  // spinner and can't be double-fired; the dialog closes once it resolves.
  const [applying, setApplying] = useState(false);

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

  function commitGroupValue(key: string, value: string[], allowEmpty = false) {
    setDraft((prev) => ({
      ...prev,
      // Grid groups keep the no-clear guard for ordinary chip toggles (empty =
      // everything hidden). Search groups treat empty as "no filter", and an
      // explicit section/group "None" is allowed to clear a grid group too.
      [key]: !allowEmpty && !searchLabels.has(key) && value.length === 0 ? prev[key] : value,
    }));
    setChanged((prev) => new Set(prev).add(key));
    setCleared(false);
  }

  function handleGroupChange(key: string, value: string[]) {
    commitGroupValue(key, value);
  }

  async function handleApply() {
    if (applying) return;
    setApplying(true);
    try {
      await onApply(resolveFilterApply(groups.map(toApplyGroup), draft, values, changed, cleared), {
        cleared,
        text: textDraft.trim(),
      });
      onClose();
    } finally {
      setApplying(false);
    }
  }

  function handleClear() {
    setDraft(initialDraft(groups, {}));
    setChanged(new Set());
    setTextDraft("");
    setCleared(true);
  }

  function handleSelectAll(group: FilterGroup) {
    handleGroupChange(group.label, allOptionValues(group));
  }

  function handleDeselectAll(group: FilterGroup) {
    commitGroupValue(group.label, [], true);
  }

  // A group's summary chips: the drafted selection resolved to option labels
  // (ids that no longer resolve to an option are dropped — a chip cannot name
  // something the dialog does not list, so removal can never delete an id the
  // user cannot see). A group whose selection means "no filter" shows the
  // dimmed "All …" line instead of a chip per option.
  function pickerSummaryItems(group: FilterGroup): PickerBadgeItem[] {
    return (draft[group.label] ?? [])
      .map((value) => group.options.find((option) => option.value === value))
      .filter((option): option is FilterOption => option !== undefined)
      .map((option) => ({
        key: option.value,
        label: option.label,
        self: option.self,
      }));
  }

  /** The ✕ on a summary chip: the same untick the badge grid performs, by value. */
  function removeChipValue(group: FilterGroup, value: string) {
    const current = draft[group.label] ?? [];
    handleGroupChange(
      group.label,
      current.filter((entry) => entry !== value),
    );
  }

  function toggleOption(group: FilterGroup, value: string) {
    const current = draft[group.label] ?? [];
    handleGroupChange(
      group.label,
      current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value],
    );
  }

  const hasActiveFilter =
    (textFilter !== undefined && textDraft.trim() !== "") ||
    groups.some((group) => !isGroupUnfiltered(toApplyGroup(group), draft[group.label] ?? []));

  return (
    <Stack gap="md" style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
      <Stack gap="lg" style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingRight: 2 }}>
        {textFilter && (
          <Stack gap={6}>
            <Text fw={600} size="sm">
              {textFilter.label}
            </Text>
            <TextInput
              aria-label={textFilter.label}
              value={textDraft}
              onChange={(event) => setTextDraft(event.currentTarget.value)}
              placeholder={textFilter.placeholder ?? "Type to match"}
              maxLength={textFilter.maxLength ?? DEFAULT_TEXT_FILTER_MAX_LENGTH}
              leftSection={<IconSearch size={16} />}
              rightSectionPointerEvents="all"
              rightSection={
                textDraft.length > 0 ? (
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label={`Clear ${textFilter.label}`}
                    onClick={() => setTextDraft("")}
                  >
                    <IconX size={14} />
                  </ActionIcon>
                ) : undefined
              }
            />
          </Stack>
        )}
        {groups.map((group) => {
          const collapsible = collapsedGroupLabels.includes(group.label);
          const shown = !collapsible || expanded.has(group.label);
          const isSearch = group.variant === "search";
          const selected = draft[group.label] ?? [];
          const state = groupFilterState(toApplyGroup(group), selected);
          // A group whose selection means "no filter" is named, not enumerated:
          // one dimmed line instead of a chip per option.
          const summaryItems = state.kind === "all" ? [] : pickerSummaryItems(group);
          const summary = (
            <PickerBadges
              items={summaryItems}
              cap={5}
              onRemove={(item) => removeChipValue(group, item.key)}
              empty={
                <Text size="xs" c="dimmed">
                  {state.kind === "none"
                    ? "None selected"
                    : `All ${group.label.toLocaleLowerCase()}`}
                </Text>
              }
            />
          );
          const toggleExpanded = () =>
            setExpanded((prev) => {
              const next = new Set(prev);
              if (next.has(group.label)) {
                next.delete(group.label);
              } else {
                next.add(group.label);
              }
              return next;
            });
          return (
            <div key={group.label}>
              <FilterGroupHeader
                group={group}
                selected={selected}
                state={state}
                collapsible={collapsible}
                shown={shown}
                onToggleExpanded={toggleExpanded}
                onAll={() => handleSelectAll(group)}
                onNone={() => handleDeselectAll(group)}
                onAction={() =>
                  group.action?.apply((values) => handleGroupChange(group.label, values), {
                    selected,
                    allValues: allOptionValues(group),
                  })
                }
              />
              {shown &&
                (isSearch ? (
                  <Group justify="space-between" align="center" gap="xs" mt="xs" wrap="wrap">
                    {summary}
                    <PickerTrigger count={selected.length} onOpen={() => openPicker(group)} />
                  </Group>
                ) : group.sections ? (
                  <Stack gap={0} mt="xs">
                    <EventTypeGroupGrid
                      sections={group.sections}
                      mode="multi"
                      isSelected={(value) => (draft[group.label] ?? []).includes(value)}
                      onToggle={(value) => toggleOption(group, value)}
                    />
                  </Stack>
                ) : (
                  <Group gap="xs" mt="xs">
                    {group.options.map((option) => (
                      <SelectableBadge
                        key={option.value}
                        label={option.label}
                        self={option.self}
                        selected={(draft[group.label] ?? []).includes(option.value)}
                        onToggle={() => toggleOption(group, option.value)}
                      />
                    ))}
                  </Group>
                ))}
              {/* A collapsed group still names what it is holding: its chips stay
                  visible — and removable — so hiding a group never hides a filter
                  the user has to hunt for later. */}
              {!shown && <Box mt="xs">{summary}</Box>}
            </div>
          );
        })}
      </Stack>

      {/* No confirmLabel: the dialog both adds and removes, so it takes the
          shared "Done" — "Apply" here would shadow this dialog's own Apply. */}
      <UserSelectModal
        opened={pickerOpened}
        onClose={() => setPickerOpened(false)}
        groups={pickerContent?.groups ?? []}
        values={pickerContent?.values ?? {}}
        onConfirm={(values) => {
          if (pickerContent) {
            handleGroupChange(pickerContent.label, Object.values(values).flat());
          }
          setPickerOpened(false);
        }}
        zIndex={200}
      />

      {hint && (
        <Text size="xs" c="dimmed">
          {hint}
        </Text>
      )}

      <Group justify="space-between" mt="md" wrap="wrap">
        {/* "Reset filters" restores the role defaults; a group's own "None" is a
            different thing (an explicit empty selection) and keeps that name. */}
        <Button variant="subtle" color="gray" onClick={handleClear} disabled={!hasActiveFilter}>
          Reset filters
        </Button>
        <Group gap="xs">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleApply()}
            loading={applying}
            disabled={applying}
            loaderProps={BUTTON_LOADER_PROPS}
          >
            Apply
          </Button>
        </Group>
      </Group>
    </Stack>
  );
}
