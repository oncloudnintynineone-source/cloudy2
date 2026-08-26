/** One selectable option inside a picker group. */
export interface PickerOption {
  id: string;
  label: string;
  /** Optional case-insensitive search terms beyond the label (e.g. shortname). */
  search?: string;
}

/** A labeled section of options rendered as one block of badges. */
export interface PickerGroup {
  label: string;
  options: PickerOption[];
}

export interface UserGroupInput {
  id: string;
  label: string;
  department: string | null;
  search?: string;
}

export const NO_DEPARTMENT_LABEL = "No department";

const COLLATOR = { sensitivity: "base" } as const;

function compareLabels(a: string, b: string): number {
  return a.localeCompare(b, undefined, COLLATOR);
}

function sortOptions(options: PickerOption[]): PickerOption[] {
  return [...options].sort((a, b) => compareLabels(a.label, b.label));
}

/** Case-insensitive: the trimmed query appears in the label or the extra search terms. */
export function optionMatchesQuery(option: PickerOption, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") {
    return true;
  }
  return (
    option.label.toLowerCase().includes(q) ||
    (option.search !== undefined && option.search.toLowerCase().includes(q))
  );
}

/** Keeps section order; sorts each section's options by label (case-insensitive). */
export function sortOptionsInGroups(groups: PickerGroup[]): PickerGroup[] {
  return groups.map((group) => ({ ...group, options: sortOptions(group.options) }));
}

/**
 * Group a flat roster into per-department sections. Users without a department
 * share a "No department" section that always sorts last; the remaining
 * sections and the options within every section sort alphabetically
 * (case-insensitive).
 */
export function buildUserGroups(users: UserGroupInput[]): PickerGroup[] {
  const byDepartment = new Map<string, PickerOption[]>();
  const undepartmented: PickerOption[] = [];
  for (const user of users) {
    const option: PickerOption = { id: user.id, label: user.label, search: user.search };
    if (user.department === null || user.department === "") {
      undepartmented.push(option);
    } else {
      const list = byDepartment.get(user.department);
      if (list) {
        list.push(option);
      } else {
        byDepartment.set(user.department, [option]);
      }
    }
  }
  const groups: PickerGroup[] = [...byDepartment.entries()]
    .map(([label, options]) => ({ label, options }))
    .sort((a, b) => compareLabels(a.label, b.label));
  if (undepartmented.length > 0) {
    groups.push({ label: NO_DEPARTMENT_LABEL, options: undepartmented });
  }
  return sortOptionsInGroups(groups);
}

/**
 * Narrow sections by a search query: an option is kept when it matches or its
 * section label matches (so typing a department name keeps that whole
 * department), and sections left empty are dropped. A blank query returns the
 * sections untouched.
 */
export function filterPickerGroups(groups: PickerGroup[], query: string): PickerGroup[] {
  const q = query.trim().toLowerCase();
  if (q === "") {
    return groups;
  }
  return groups
    .map((group) => {
      const sectionMatches = group.label.toLowerCase().includes(q);
      return {
        ...group,
        options: group.options.filter((option) => sectionMatches || optionMatchesQuery(option, q)),
      };
    })
    .filter((group) => group.options.length > 0);
}

/**
 * Seed a picker draft from a flat selection: per section label, that section's
 * selected option ids in section order. Ids that belong to no section are
 * ignored.
 */
export function selectionByGroup(groups: PickerGroup[], selected: string[]): Record<string, string[]> {
  const selectedIds = new Set(selected);
  const result: Record<string, string[]> = {};
  for (const group of groups) {
    result[group.label] = group.options
      .filter((option) => selectedIds.has(option.id))
      .map((option) => option.id);
  }
  return result;
}
