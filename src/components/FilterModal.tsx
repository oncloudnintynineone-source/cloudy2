"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Badge,
  Button,
  Collapse,
  Group,
  Modal,
  Stack,
  Text,
  UnstyledButton,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery, useViewportSize } from "@mantine/hooks";
import { IconChevronDown, IconPlus } from "@tabler/icons-react";

import { AllNoneControls } from "@/components/AllNoneControls";
import { PickerBadges, type PickerBadgeItem } from "@/components/PickerField";
import { SelectableBadge } from "@/components/SelectableBadge";
import { UserSelectModal } from "@/components/UserSelectModal";
import { sectionSelectionState } from "@/lib/filters/filterSections";
import {
  isGroupUnfiltered,
  resolveFilterApply,
  type FilterApplyGroup,
} from "@/lib/filters/resolveFilterApply";
import { modalContentWidth, type Rect } from "@/lib/motion/origin";
import { modalZoomTransitionProps } from "@/lib/motion/transitions";
import { useMotion } from "@/components/MotionProvider";
import { NARROW_MEDIA_QUERY, BUTTON_LOADER_PROPS } from "@/lib/theme";
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
  /**
   * The department's display order (calendars.sort_order) for search-variant
   * groups: when present the department sections follow the Settings →
   * Departments order instead of sorting alphabetically.
   */
  departmentSort?: number | null;
  /**
   * The department's registry id (calendars.id) for search-variant groups.
   * Together with `departmentParentId` it lets the picker nest a department's
   * section under its parents (id-keyed grouping, stable across renames).
   */
  departmentId?: string | null;
  /**
   * The department's parent department id (calendars.parent_id), used with
   * `departmentId` to compute each section's nesting depth.
   */
  departmentParentId?: string | null;
  /** True when this option is the signed-in user (amber "mine" badge). */
  self?: boolean;
}

/**
 * A presentation-only section inside a filter group (event-type groups, the
 * department blocks of a user picker, …). The group's flat `options` stay the
 * canonical value list for apply/count logic; sections only decide how the
 * options are chunked on screen.
 */
export interface FilterGroupSection {
  /** Stable identity across re-renders (event-type group id, department id, …). */
  id: string;
  label: string;
  /** Folder-style section: collapsed by default, chevron header. */
  collapsible?: boolean;
  options: FilterOption[];
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
  /** Every selectable value in the group (also the union of `sections`). */
  options: FilterOption[];
  /**
   * Optional grouped presentation. Inline sections render first, folders last
   * (the event-type builder already orders them); flat groups omit this.
   */
  sections?: FilterGroupSection[];
  /** Optional quick action rendered beside the group label (e.g. "My Events"). */
  action?: FilterGroupAction;
  /**
   * "grid" (default) renders the options as toggleable `SelectableBadge`s,
   * optionally split into `sections` (event-type groups). "search" renders a
   * badge picker dialog (UserSelectModal) for large option lists:
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

/** Result of an Apply: the resolved values plus whether "Clear" produced them. */
export interface FilterApplyMeta {
  /**
   * True when the user pressed "Clear" (then Apply). Grid groups resolve to an
   * empty array either way, so a consumer that distinguishes "role default"
   * from a genuine empty selection (the dashboard) reads this flag instead.
   */
  cleared: boolean;
}

interface FilterModalProps {
  opened: boolean;
  onClose: () => void;
  title: string;
  groups: FilterGroup[];
  values: Record<string, string[]>;
  onApply: (values: Record<string, string[]>, meta: FilterApplyMeta) => void | Promise<void>;
  /**
   * Viewport rect of the trigger button, captured on tap. Drives the modal's
   * standard grow/shrink-from-element zoom animation (see `lib/motion/origin`).
   * Omit for a plain centered zoom.
   */
  originRect?: Rect | null;
  /**
   * Group labels that start collapsed behind a "Show …" toggle. Only the
   * groups most users reach stay open (the dashboard promotes Calendars +
   * Users and tucks Event Types away); audit-log/user-table callers omit this
   * and keep every group expanded.
   */
  collapsedGroupLabels?: string[];
  /** Optional dimmed hint above the actions (e.g. the per-view scope note). */
  hint?: string;
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

function sectionKey(group: FilterGroup, section: FilterGroupSection): string {
  return `${group.label}\u0000${section.id}`;
}

/**
 * Folders holding an already-applied option start open, so a filtered type is
 * visible the moment the Event Types group is expanded; every other folder
 * starts collapsed (the wizard's behavior).
 */
function initialOpenSections(
  groups: FilterGroup[],
  values: Record<string, string[]>,
): ReadonlySet<string> {
  const open = new Set<string>();
  for (const group of groups) {
    // Only an explicitly applied selection opens its folders. An empty grid
    // selection means "no filter" (every type selected in the draft), which
    // must not auto-expand every folder.
    const selected = new Set(values[group.label] ?? []);
    for (const section of group.sections ?? []) {
      if (
        section.collapsible &&
        section.options.some((option) => selected.has(option.value))
      ) {
        open.add(sectionKey(group, section));
      }
    }
  }
  return open;
}

/**
 * Reusable filter dialog: opens from a trigger button and presents each filter
 * group as selectable badges — flat or split into inline/folder sections — or as
 * a selected-badge summary + Select trigger that opens the UserSelectModal badge
 * picker (variant "search", for large option lists). Every group gets an All/None
 * pair (search groups say "Clear"); grouped lists keep section counts and folders,
 * but the All/None action spans the whole group.
 * Selections are staged in a draft and only applied when "Apply" is pressed. The
 * draft lives in a child that mounts with the modal, so it re-initializes from the
 * current applied values every time the dialog opens. "No filter applied" is "all
 * selected" in grid groups and "nothing selected" in search groups.
 */
export function FilterModal({
  opened,
  onClose,
  title,
  groups,
  values,
  onApply,
  collapsedGroupLabels,
  hint,
  originRect = null,
}: FilterModalProps) {
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const isNarrow = useMediaQuery(NARROW_MEDIA_QUERY);
  const motion = useMotion();

  // The modal zooms out of / shrinks back into the trigger button (the app's
  // standard grow/shrink animation; mirror the other zoom modals).
  const viewportSize = useViewportSize();
  const viewport = { w: viewportSize.width, h: viewportSize.height };
  const contentWidth = modalContentWidth(viewport, isNarrow ? 300 : isDesktop ? 440 : 380);
  const transitionProps = modalZoomTransitionProps(motion, originRect, viewport, contentWidth);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      centered
      size={isNarrow ? "xs" : isDesktop ? "md" : "sm"}
      transitionProps={transitionProps}
      styles={{
        content: {
          maxHeight: "min(680px, calc(100dvh - 96px))",
          display: "flex",
          flexDirection: "column",
        },
        body: {
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        },
      }}
    >
      <FilterModalBody
        groups={groups}
        values={values}
        onApply={onApply}
        onClose={onClose}
        collapsedGroupLabels={collapsedGroupLabels}
        hint={hint}
      />
    </Modal>
  );
}

function FilterModalBody({
  groups,
  values,
  onApply,
  onClose,
  collapsedGroupLabels = [],
  hint,
}: Pick<
  FilterModalProps,
  "groups" | "values" | "onApply" | "onClose" | "collapsedGroupLabels" | "hint"
>) {
  const motion = useMotion();
  const [draft, setDraft] = useState<Record<string, string[]>>(() => initialDraft(groups, values));
  // Collapsed groups start hidden and expand per-group; the toggle is local
  // to the dialog session (re-opening resets to the collapsed start).
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  // Folder-style sections (event-type groups) start collapsed unless they hold
  // an already-applied option.
  const [expandedSections, setExpandedSections] = useState<ReadonlySet<string>>(() =>
    initialOpenSections(groups, values),
  );
  // Grid groups the user edited (apply their draft explicitly — including a
  // full selection) and whether "Clear" was pressed (apply nothing, restoring
  // the consumer's default). Untouched grid groups re-apply their current
  // values, so re-opening the dialog and pressing Apply keeps an existing
  // filter. Search groups ignore both and keep empty = no filter.
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

  function toggleSection(group: FilterGroup, section: FilterGroupSection) {
    const key = sectionKey(group, section);
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  async function handleApply() {
    if (applying) return;
    setApplying(true);
    try {
      await onApply(resolveFilterApply(groups.map(toApplyGroup), draft, values, changed, cleared), {
        cleared,
      });
      onClose();
    } finally {
      setApplying(false);
    }
  }

  function handleClear() {
    setDraft(initialDraft(groups, {}));
    setChanged(new Set());
    setCleared(true);
  }

  function handleSelectAll(group: FilterGroup) {
    handleGroupChange(group.label, allOptionValues(group));
  }

  function handleDeselectAll(group: FilterGroup) {
    commitGroupValue(group.label, [], true);
  }

  // The search-group summary badges: the drafted selection resolved to option
  // labels (ids that no longer resolve to an option are dropped).
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

  function toggleOption(group: FilterGroup, value: string) {
    const current = draft[group.label] ?? [];
    handleGroupChange(
      group.label,
      current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value],
    );
  }

  function renderSection(group: FilterGroup, section: FilterGroupSection) {
    const selected = draft[group.label] ?? [];
    const open =
      !section.collapsible || expandedSections.has(sectionKey(group, section));
    return (
      <div key={section.id}>
        <Group justify="space-between" align="center" gap="xs" wrap="nowrap">
          {section.collapsible ? (
            <UnstyledButton
              onClick={() => toggleSection(group, section)}
              aria-expanded={open}
              aria-label={`${section.label}, ${section.options.length} option${
                section.options.length === 1 ? "" : "s"
              }`}
              style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
            >
              <Group gap={6} wrap="nowrap">
                <IconChevronDown
                  size={14}
                  style={{
                    flexShrink: 0,
                    transform: open ? "rotate(180deg)" : undefined,
                    transition: `transform ${motion.duration.micro}ms ${motion.easing.out}`,
                  }}
                />
                <Text size="sm" fw={600} truncate>
                  {section.label}
                </Text>
                <Badge size="sm" variant="light" color="gray" aria-hidden>
                  {section.options.length}
                </Badge>
              </Group>
            </UnstyledButton>
          ) : (
            <Group gap={6} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
              <Text size="xs" fw={600} c="dimmed" truncate>
                {section.label}
              </Text>
              <Badge size="sm" variant="light" color="gray" aria-hidden>
                {section.options.length}
              </Badge>
            </Group>
          )}
        </Group>
        <Collapse expanded={open} transitionDuration={motion.duration.micro}>
          <Group gap="xs" mt="xs">
            {section.options.map((option) => (
              <SelectableBadge
                key={option.value}
                label={option.label}
                self={option.self}
                selected={selected.includes(option.value)}
                onToggle={() => toggleOption(group, option.value)}
              />
            ))}
          </Group>
        </Collapse>
      </div>
    );
  }

  const hasActiveFilter = groups.some(
    (group) => !isGroupUnfiltered(toApplyGroup(group), draft[group.label] ?? []),
  );

  return (
    <Stack gap="md" style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
      <Stack gap="lg" style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingRight: 2 }}>
        {groups.map((group) => {
          const collapsible = collapsedGroupLabels.includes(group.label);
          const shown = !collapsible || expanded.has(group.label);
          const isSearch = group.variant === "search";
          const groupState = sectionSelectionState(group.options, draft[group.label] ?? []);
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
              <Group justify="space-between" align="center" gap="xs" wrap="wrap">
                <Group gap="xs" align="center" wrap="nowrap">
                  <Text fw={600} size="sm">
                    {group.label}
                  </Text>
                  {group.sections && (
                    <Badge size="sm" variant="light" color="gray" aria-hidden>
                      {(draft[group.label] ?? []).length}/{group.options.length}
                    </Badge>
                  )}
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
                      onClick={toggleExpanded}
                    >
                      {shown ? "Hide" : "Show"}
                    </Button>
                  )}
                  {shown && (
                    <>
                      <AllNoneControls
                        label={group.label}
                        allSelected={groupState === "all"}
                        noneSelected={groupState === "none"}
                        noneLabel={isSearch ? "Clear" : "None"}
                        onAll={() => handleSelectAll(group)}
                        onNone={() => handleDeselectAll(group)}
                      />
                      {group.action && (
                        <Button
                          size="xs"
                          variant={
                            group.action.isApplied(draft[group.label] ?? []) ? "light" : "default"
                          }
                          color="brand"
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
                    </>
                  )}
                </Group>
              </Group>
              {shown &&
                (isSearch ? (
                  <Group justify="space-between" align="center" gap="xs" mt="xs" wrap="wrap">
                    <PickerBadges
                      items={pickerSummaryItems(group)}
                      cap={5}
                      empty={
                        <Text size="xs" c="dimmed">
                          All {group.label.toLowerCase()}
                        </Text>
                      }
                    />
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={<IconPlus size={14} />}
                      onClick={() => openPicker(group)}
                    >
                      Select
                    </Button>
                  </Group>
                ) : group.sections ? (
                  <Stack gap="sm" mt="xs">
                    {group.sections.map((section) => renderSection(group, section))}
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
            </div>
          );
        })}
      </Stack>

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
        confirmLabel="Apply"
        zIndex={200}
      />

      {hint && (
        <Text size="xs" c="dimmed">
          {hint}
        </Text>
      )}

      <Group justify="space-between" mt="md" wrap="wrap">
        <Button variant="subtle" color="gray" onClick={handleClear} disabled={!hasActiveFilter}>
          Clear
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
