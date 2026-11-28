/**
 * The filter dialog's presentation model — the pure half of the two-level
 * sheet (`FilterModalBody`): what each group row says, whether a group needs a
 * search box, how its options chunk into sections, and what the dialog's
 * effective-result line reads.
 *
 * The **semantics** of a selection stay in `resolveFilterApply.ts` (what Apply
 * stores); this module only *names* that state, so a row can never claim
 * something Apply will not do — it always asks {@link groupFilterState}.
 * Kept I/O-free (no React, no components) so the wording rules and the section
 * math are unit-testable without a dialog.
 *
 * Design: docs/dashboard-views.md §1.2, docs/user-picker.md §1.7.
 */

import { sectionSelectionState } from "./filterSections";
import { groupFilterState, type FilterApplyGroup } from "./resolveFilterApply";
import {
  buildUserGroups,
  filterPickerGroups,
  sortOptionsInGroups,
  type PickerGroup,
  type PickerOption,
} from "@/lib/users/userSelect";

/**
 * Option lists longer than this get a search box inside their panel. Below it
 * the whole list is scannable in one screen, so a search field would be chrome
 * over chrome. Deliberately a size rule, not a variant rule: a 40-department
 * group searches, a 6-status group does not, whatever the caller called it.
 */
export const FILTER_SEARCH_THRESHOLD = 12;

/** One selectable option, structurally compatible with `FilterOption`. */
export interface FilterModelOption {
  value: string;
  label: string;
  search?: string;
  self?: boolean;
  department?: string | null;
  departmentSort?: number | null;
  departmentId?: string | null;
  departmentParentId?: string | null;
}

/** One presentation section of a group (an event-type group, a department). */
export interface FilterModelSection {
  id: string;
  label: string;
  options: FilterModelOption[];
  /**
   * The admin's per-group flag (event-type groups only): `false` keeps the
   * section inline, `true`/absent lets the panel hide its members behind a group
   * chip. Departments carry no flag, so their sections group by default.
   */
  collapsible?: boolean;
  /**
   * A department section's nearest shown parent, so its chip can read
   * `Parent (Department)` instead of being indented (see `sectionChipText`).
   */
  parentLabel?: string;
}

/** A filter group, structurally compatible with `FilterGroup`. */
export interface FilterModelGroup {
  label: string;
  options: FilterModelOption[];
  sections?: FilterModelSection[];
  /** Selection semantics (see `resolveFilterApply`); never a layout switch. */
  variant?: "grid" | "search";
  /** Overrides the {@link FILTER_SEARCH_THRESHOLD} rule for this group. */
  searchable?: boolean;
}

/** The group shape the apply/state helpers take. */
export function toApplyGroup(group: FilterModelGroup): FilterApplyGroup {
  return {
    label: group.label,
    optionCount: group.options.length,
    variant: group.variant,
    optionValues: group.options.map((option) => option.value),
  };
}

/**
 * A group row's state. `default` is the honest label for the state
 * **Reset filters** leaves behind: the draft shows a full selection, but Apply
 * stores the role default (for a non-admin that is *not* everything), so the
 * row must not read "All".
 */
export type FilterRowKind = "all" | "none" | "some" | "default";

export interface FilterRowState {
  kind: FilterRowKind;
  /** Compact state word: `"All"` / `"None"` / `"3 of 12"` / `"Default"`. */
  label: string;
  /** Row subtitle: `"All calendars"` / `"3 of 12 calendars"` / `"Default"`. */
  subtitle: string;
  /** True when the group narrows the result set. */
  active: boolean;
  count: number;
  optionCount: number;
}

export function groupRowState(
  group: FilterModelGroup,
  selected: readonly string[],
  opts: { cleared?: boolean; touched?: boolean } = {},
): FilterRowState {
  const state = groupFilterState(toApplyGroup(group), selected);
  const optionCount = group.options.length;
  if (opts.cleared && !opts.touched) {
    return {
      kind: "default",
      label: "Default",
      subtitle: "Default",
      active: false,
      count: state.count,
      optionCount,
    };
  }
  const noun = group.label.toLocaleLowerCase();
  const subtitle =
    state.kind === "all"
      ? `All ${noun}`
      : state.kind === "none"
        ? `No ${noun}`
        : `${state.count} of ${optionCount} ${noun}`;
  return {
    kind: state.kind,
    label: state.label,
    subtitle,
    active: state.active,
    count: state.count,
    optionCount,
  };
}

/** Whether a group's panel carries a search box. */
export function isGroupSearchable(group: FilterModelGroup): boolean {
  return group.searchable ?? group.options.length > FILTER_SEARCH_THRESHOLD;
}

/** One option as the panel renders it. */
export interface FilterPanelOption {
  value: string;
  label: string;
  self?: boolean;
  /** Department-tree depth for indentation (department-as-option rows). */
  depth?: number;
}

/** One rendered section of a panel, with its own selection count. */
export interface FilterPanelSection {
  /** Stable while filtering: the section label (unique within a group). */
  key: string;
  label: string;
  options: FilterPanelOption[];
  selectedCount: number;
  totalCount: number;
  /** Department-tree depth of this section (0 = top level) for indentation. */
  depth?: number;
  /** The admin's per-group flag (see {@link FilterModelSection.collapsible}). */
  collapsible?: boolean;
  /** A department section's nearest shown parent (see {@link sectionChipText}). */
  parentLabel?: string;
}

function toPickerOption(option: FilterModelOption): PickerOption {
  return { id: option.value, label: option.label, search: option.search, self: option.self };
}

/**
 * The group's sections in display order: the caller's own sections
 * (event-type groups) first, then per-department sections when the options
 * carry a department (the roster, audit-log actors), then one flat section.
 */
function toPickerGroups(group: FilterModelGroup): PickerGroup[] {
  if (group.sections?.length) {
    return group.sections.map((section) => ({
      label: section.label,
      parentLabel: section.parentLabel,
      options: section.options.map(toPickerOption),
    }));
  }
  if (group.options.some((option) => option.department !== undefined)) {
    return buildUserGroups(
      group.options.map((option) => ({
        id: option.value,
        label: option.label,
        department: option.department ?? null,
        search: option.search,
        self: option.self,
        departmentSort: option.departmentSort ?? null,
        departmentId: option.departmentId ?? null,
        departmentParentId: option.departmentParentId ?? null,
      })),
    );
  }
  return [{ label: group.label, options: group.options.map(toPickerOption) }];
}

/**
 * The panel's rendered sections for a query: the same pipeline the user picker
 * always used (`buildUserGroups` → `filterPickerGroups` → `sortOptionsInGroups`),
 * so department nesting, section order and fuzzy matching cannot drift between
 * surfaces. Sections emptied by the query disappear.
 */
export function panelSections(
  group: FilterModelGroup,
  query: string,
  selected: readonly string[],
): FilterPanelSection[] {
  const chosen = new Set(selected);
  // The admin's per-group flag rides the source section, not the picker pipeline
  // (the picker has no use for it), so it is looked up by label afterwards.
  const collapsibleByLabel = new Map<string, boolean | undefined>(
    (group.sections ?? []).map((section) => [section.label, section.collapsible]),
  );
  return sortOptionsInGroups(filterPickerGroups(toPickerGroups(group), query))
    .filter((section) => section.options.length > 0)
    .map((section) => ({
      key: section.label,
      label: section.label,
      depth: section.depth,
      collapsible: collapsibleByLabel.get(section.label),
      parentLabel: section.parentLabel,
      options: section.options.map((option) => ({
        value: option.id,
        label: option.label,
        self: option.self,
        depth: option.depth,
      })),
      selectedCount: section.options.reduce(
        (count, option) => count + (chosen.has(option.id) ? 1 : 0),
        0,
      ),
      totalCount: section.options.length,
    }));
}

/**
 * Whether a section hides its members behind a group chip, the way the wizard's
 * type step hides a folder group's types.
 *
 * Three rules, and the section has to pass all of them:
 * - the admin did not mark the group as inline (`collapsible: false`);
 * - the panel really is chunked (≥ 2 sections) — with one section left there is
 *   nothing to hide it behind, which is also why a search that narrows the list
 *   to one block shows that block's chips immediately;
 * - the section has members to hide (an empty section never renders at all).
 *
 * Departments carry no flag, so they pass by default: a department *is* the group
 * name its users belong under.
 */
export function sectionRendersAsChip(
  section: FilterPanelSection,
  sections: readonly FilterPanelSection[],
): boolean {
  return section.collapsible !== false && sections.length >= 2;
}

/**
 * A group chip's accessible name. The chip **prints no count** (1.439 — the
 * panel row is the group name alone); the count still reaches assistive tech
 * here, and the state stays visible to the eye as the chip's fill plus the
 * group's own state word and the footer's `Showing:` line.
 */
export function sectionChipAriaLabel(section: FilterPanelSection): string {
  return `${sectionChipText(section)}, ${section.selectedCount} of ${section.totalCount} selected`;
}

/**
 * A group chip's visible text: the section's own name, or `Parent (Department)`
 * for a sub-department (1.440). The qualifier replaces horizontal indentation —
 * in a chip grid an indent would stagger the columns, and the label says the
 * hierarchy more directly. A top-level department, the "Other" section and any
 * parent that is not shown keep the plain name.
 */
export function sectionChipText(section: FilterPanelSection): string {
  return section.parentLabel ? `${section.parentLabel} (${section.label})` : section.label;
}

/** One run of a panel: consecutive group chips, or one inline section. */
export type FilterPanelRun =
  | { kind: "chips"; sections: FilterPanelSection[] }
  | { kind: "inline"; section: FilterPanelSection };

/**
 * Split a panel's sections into render runs, preserving their order: consecutive
 * chip sections share one grid container (`sectionRendersAsChip`), while each
 * inline section keeps its own header + chip block.
 */
export function groupPanelRuns(sections: readonly FilterPanelSection[]): FilterPanelRun[] {
  const runs: FilterPanelRun[] = [];
  for (const section of sections) {
    if (!sectionRendersAsChip(section, sections)) {
      runs.push({ kind: "inline", section });
      continue;
    }
    const last = runs[runs.length - 1];
    if (last !== undefined && last.kind === "chips") {
      last.sections.push(section);
      continue;
    }
    runs.push({ kind: "chips", sections: [section] });
  }
  return runs;
}

/**
 * Whether the panel names its sections: only when the group really is chunked,
 * or when a lone section says something the group label does not (the one
 * department holding every listed user).
 */
export function showsSectionHeaders(
  group: FilterModelGroup,
  sections: readonly FilterPanelSection[],
): boolean {
  if (sections.length > 1) {
    return true;
  }
  const only = sections[0];
  return only !== undefined && only.label !== group.label;
}

/** `"all" | "none" | "some"` for one section — drives its All/None pair. */
export function sectionState(
  section: FilterPanelSection,
  selected: readonly string[],
): ReturnType<typeof sectionSelectionState> {
  return sectionSelectionState(section.options, selected);
}

/**
 * The dialog's one statement of what Apply will do, e.g.
 * `All calendars · 3 of 12 users · Event name "parade"`. It is the group rows'
 * own subtitles joined, so the line and the rows cannot disagree — and it is
 * **state**, never an instruction (the app stopped narrating itself in 1.410).
 */
export function effectiveSetLine(
  groups: readonly FilterModelGroup[],
  draft: Record<string, readonly string[]>,
  text?: { label: string; value: string },
  opts: { cleared?: boolean; touched?: ReadonlySet<string> } = {},
): string {
  const parts = groups.map((group) =>
    groupRowState(group, draft[group.label] ?? [], {
      cleared: opts.cleared,
      touched: opts.touched?.has(group.label) ?? false,
    }).subtitle,
  );
  const trimmed = text?.value.trim() ?? "";
  if (trimmed !== "" && text) {
    parts.push(`${text.label} "${trimmed}"`);
  }
  return parts.join(" · ");
}
