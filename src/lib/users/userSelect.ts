import { departmentPathLabels, type DepartmentRow } from "@/lib/roster/hierarchy";
import { fuzzyFilter, fuzzyMatches } from "@/lib/search/fuzzy";

/** One selectable option inside a picker group. */
export interface PickerOption {
  id: string;
  label: string;
  /** Optional case-insensitive search terms beyond the label (e.g. shortname). */
  search?: string;
  /**
   * Nesting depth of a department-as-option row (a department list rendered in
   * tree preorder). When present on any option of a section, that section
   * renders its options as indented rows in the given order instead of as
   * wrapped, alphabetically-sorted badges.
   */
  depth?: number;
}

/** A labeled section of options rendered as one block of badges. */
export interface PickerGroup {
  label: string;
  options: PickerOption[];
  /**
   * Nesting depth of this section's department in the department tree (0 =
   * top level; a nested section is indented under its parent's section). Set
   * by `buildUserGroups` only for sections keyed by a real department id —
   * name-keyed fallbacks ("Other", legacy callers) and "No department" are
   * flat.
   */
  depth?: number;
}

export interface UserGroupInput {
  id: string;
  label: string;
  department: string | null;
  search?: string;
  /**
   * The department's display order (calendars.sort_order). When present on any
   * member of a department, that department's section is ordered by it instead
   * of alphabetically — sections follow the Settings → Departments order.
   */
  departmentSort?: number | null;
  /**
   * The department's registry id (calendars.id). When present, it becomes the
   * grouping key (stable across renames) and lets the builder nest the section
   * under its parents; absent members group by `department` name as before.
   */
  departmentId?: string | null;
  /**
   * The department's parent department id (calendars.parent_id), used with
   * `departmentId` to compute each section's nesting depth — an indent counts
   * only ancestors that also have members in this picker, so it never floats
   * under a section that is not shown.
   */
  departmentParentId?: string | null;
}

export const NO_DEPARTMENT_LABEL = "No department";

const COLLATOR = { sensitivity: "base" } as const;

function compareLabels(a: string, b: string): number {
  return a.localeCompare(b, undefined, COLLATOR);
}

function sortOptions(options: PickerOption[]): PickerOption[] {
  return [...options].sort((a, b) => compareLabels(a.label, b.label));
}

/** Fuzzy match: the trimmed query appears (typo-tolerant) in the label or the extra search terms. */
export function optionMatchesQuery(option: PickerOption, query: string): boolean {
  return fuzzyMatches([option.label, { value: option.search, fuzzy: false }], query);
}

/**
 * Keeps section order; sorts each section's options by label (case-insensitive)
 * — except sections whose options carry a `depth` (department rows in tree
 * preorder), which are left in the given order.
 */
export function sortOptionsInGroups(groups: PickerGroup[]): PickerGroup[] {
  return groups.map((group) => ({
    ...group,
    options: group.options.some((option) => option.depth !== undefined)
      ? group.options
      : sortOptions(group.options),
  }));
}

/**
 * Group a flat roster into per-department sections. Users without a department
 * share a "No department" section that always sorts last. Sections whose users
 * carry a `departmentSort` (the department's sort_order) sort by it ascending
 * — the flat sequence shown in Settings → Departments — falling back to their
 * name only when ranks tie. Sections without a rank sort alphabetically after
 * every ranked section, keeping callers that don't supply one on today's
 * alphabetical behavior. The options within every section sort alphabetically
 * (case-insensitive).
 *
 * When members carry a `departmentId` (+ `departmentParentId`), the section is
 * keyed by the department id and given a `depth`: the number of ancestors that
 * also have members in this picker. The preorder `sortOrder` already orders
 * ranked sections parent-before-children, so indenting each section by its
 * depth renders the roster as a nested department tree (a parent with no
 * members of its own simply isn't shown, and its children then sit at the
 * shallower depth of their nearest shown ancestor).
 */
export function buildUserGroups(users: UserGroupInput[]): PickerGroup[] {
  interface Bucket {
    key: string;
    label: string;
    options: PickerOption[];
    rank: number | null;
    id: string | null;
    parentId: string | null;
  }
  const buckets = new Map<string, Bucket>();
  const undepartmented: PickerOption[] = [];
  const hasValue = (value: string | null | undefined): value is string =>
    value !== undefined && value !== null && value !== "";

  for (const user of users) {
    const option: PickerOption = { id: user.id, label: user.label, search: user.search };
    if (user.department === null || user.department === "") {
      undepartmented.push(option);
      continue;
    }
    const byId = hasValue(user.departmentId);
    const key = byId ? user.departmentId! : user.department;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        key,
        label: user.department,
        options: [],
        rank: null,
        id: byId ? user.departmentId! : null,
        parentId: byId ? user.departmentParentId ?? null : null,
      };
      buckets.set(key, bucket);
    }
    bucket.options.push(option);
    if (bucket.rank === null && user.departmentSort !== undefined && user.departmentSort !== null) {
      bucket.rank = user.departmentSort;
    }
  }

  // Nesting depth per id-keyed section: count ancestors that also have members
  // in this picker. Cycle-safe via the seen set.
  const depthByKey = new Map<string, number>();
  for (const bucket of buckets.values()) {
    if (bucket.id === null) continue;
    const seen = new Set<string>([bucket.key]);
    let depth = 0;
    let parentId = bucket.parentId;
    while (parentId !== null && !seen.has(parentId)) {
      const parent = buckets.get(parentId);
      if (parent && parent.id === parentId) {
        depth += 1;
        seen.add(parentId);
        parentId = parent.parentId;
        continue;
      }
      break;
    }
    depthByKey.set(bucket.key, depth);
  }

  const ranked: Bucket[] = [];
  const unranked: Bucket[] = [];
  for (const bucket of buckets.values()) {
    (bucket.rank !== null ? ranked : unranked).push(bucket);
  }
  ranked.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0) || compareLabels(a.label, b.label));
  unranked.sort((a, b) => compareLabels(a.label, b.label));
  const groups: PickerGroup[] = [...ranked, ...unranked].map((bucket) => ({
    label: bucket.label,
    depth: bucket.id !== null ? depthByKey.get(bucket.key) : undefined,
    options: sortOptions(bucket.options),
  }));
  if (undepartmented.length > 0) {
    groups.push({ label: NO_DEPARTMENT_LABEL, options: sortOptions(undepartmented) });
  }
  return groups;
}

/**
 * Build the options for a department-as-option list (badge picker sections /
 * chip filters): one option per department row in tree preorder. Each option's
 * label carries its **full ancestor chain** ("HQ › Logistics › Stores"), so the
 * hierarchy reads inside the pill itself; top-level departments are their plain
 * name. The `depth` is kept purely as a "tree rows — don't re-alphabetize"
 * marker for `sortOptionsInGroups` (renderers no longer indent on it).
 */
export function departmentPickerOptions(rows: readonly DepartmentRow[]): PickerOption[] {
  const labels = departmentPathLabels(rows);
  return rows.map((row) => ({
    id: row.id,
    label: labels.get(row.id) ?? row.name,
    depth: row.depth,
  }));
}

/**
 * Narrow sections by a fuzzy search query: a whole section is kept when its
 * label fuzzy-matches (so typing a department name keeps that department), and
 * otherwise only its fuzzy-matching options remain — sections left empty are
 * dropped. A blank query returns the sections untouched. Order is preserved.
 */
export function filterPickerGroups(groups: PickerGroup[], query: string): PickerGroup[] {
  const q = query.trim();
  if (q === "") {
    return groups;
  }
  return groups
    .map((group) => {
      if (fuzzyMatches([group.label], q)) {
        return group;
      }
      return {
        ...group,
        options: fuzzyFilter(group.options, q, (option) => [
          option.label,
          { value: option.search, fuzzy: false },
        ]),
      };
    })
    .filter((group) => group.options.length > 0);
}

/**
 * Seed a picker draft from a flat selection: per section label, that section's
 * selected option ids in section order. Ids that belong to no section are
 * ignored.
 */
export function selectionByGroup(
  groups: PickerGroup[],
  selected: string[],
): Record<string, string[]> {
  const selectedIds = new Set(selected);
  const result: Record<string, string[]> = {};
  for (const group of groups) {
    result[group.label] = group.options
      .filter((option) => selectedIds.has(option.id))
      .map((option) => option.id);
  }
  return result;
}

export const INVITEE_DEPARTMENTS_SECTION = "Departments";

/** Split the prefixed invitee values (`user:<id>` / `dept:<id>`) into the two id lists. */
export function splitInvitees(invitees: string[]): {
  userIds: string[];
  departmentIds: string[];
} {
  const userIds: string[] = [];
  const departmentIds: string[] = [];
  for (const value of invitees) {
    if (value.startsWith("user:")) {
      userIds.push(value.slice("user:".length));
    } else if (value.startsWith("dept:")) {
      departmentIds.push(value.slice("dept:".length));
    }
  }
  return { userIds, departmentIds };
}

/**
 * Commit the badge picker draft into the prefixed invitee list.
 *
 * Previously selected ids that no longer appear in the picker (e.g.
 * now-inactive users/departments) are kept so editing can't silently drop
 * them. Nothing is auto-added: the organizer joins the list only when they
 * picked their own name.
 *
 * The Departments section yields department ids, every other section yields
 * user ids.
 */
export function mergeInviteeSelection(
  groups: PickerGroup[],
  previousInvitees: string[],
  draft: Record<string, string[]>,
  departmentsSectionLabel: string = INVITEE_DEPARTMENTS_SECTION,
): string[] {
  const allOptionIds = new Set(groups.flatMap((group) => group.options.map((option) => option.id)));
  const { userIds: previousUserIds, departmentIds: previousDepartmentIds } =
    splitInvitees(previousInvitees);
  const keepDepartmentIds = previousDepartmentIds.filter((id) => !allOptionIds.has(id));
  const keepUserIds = previousUserIds.filter((id) => !allOptionIds.has(id));

  const departmentIds = [
    ...new Set([...(draft[departmentsSectionLabel] ?? []), ...keepDepartmentIds]),
  ];
  const pickedUserIds = Object.keys(draft)
    .filter((label) => label !== departmentsSectionLabel)
    .flatMap((label) => draft[label] ?? []);
  const userIds = [...new Set([...pickedUserIds, ...keepUserIds])];

  return [...departmentIds.map((id) => `dept:${id}`), ...userIds.map((id) => `user:${id}`)];
}

/**
 * Quick self add/remove on the prefixed invitee list: drop the `user:<userId>`
 * entry when it is already present, otherwise append it. Other entries
 * (departments, other users) are untouched and never reordered.
 */
export function toggleInviteeUser(invitees: string[], userId: string): string[] {
  const entry = `user:${userId}`;
  return invitees.includes(entry)
    ? invitees.filter((value) => value !== entry)
    : [...invitees, entry];
}
