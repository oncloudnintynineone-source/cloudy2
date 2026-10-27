/**
 * Pure grouping/ordering helpers for the event type picker and the admin
 * group list. Kept free of I/O so they can be unit-tested without a database.
 */

export interface EventTypeGroupRef {
  id: string;
  name: string;
  sortOrder: number;
  /**
   * The admin's folder flag (Settings → Event Types). The grid-based picker
   * renders every group as a tile + popup, so this no longer changes the
   * picker layout — it is kept for the admin group list.
   */
  collapsible: boolean;
}

export interface EventTypeRef {
  name: string;
  groupId: string | null;
}

export interface EventTypePickerSection {
  /** Stable identity for the section (the group id, or `UNGROUPED_ID`). */
  id: string;
  name: string;
  /** true for the trailing catch-all of types that belong to no group. */
  ungrouped: boolean;
  types: EventTypeRef[];
}

/** Section label for types that belong to no group. */
export const UNGROUPED_LABEL = "Ungrouped";

/** Section id for the trailing catch-all of types that belong to no group. */
export const UNGROUPED_ID = "__ungrouped__";

/** Groups in display order: sortOrder, then name. */
export function sortEventTypeGroups(
  groups: readonly EventTypeGroupRef[],
): EventTypeGroupRef[] {
  return [...groups].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
}

/**
 * The sections the event-type grid picker renders: every non-empty group in
 * display order, then the trailing "Ungrouped" catch-all. Types within a
 * section stay alphabetical, empty groups are skipped, and a type whose group
 * id is missing from the list degrades to ungrouped (stale-prop defense).
 */
export function buildEventTypePickerSections(
  types: readonly EventTypeRef[],
  groups: readonly EventTypeGroupRef[],
): EventTypePickerSection[] {
  const knownGroupIds = new Set(groups.map((group) => group.id));
  const sortedTypes = [...types].sort((a, b) => a.name.localeCompare(b.name));
  const sections: EventTypePickerSection[] = [];
  for (const group of sortEventTypeGroups(groups)) {
    const members = sortedTypes.filter((type) => type.groupId === group.id);
    if (members.length > 0) {
      sections.push({
        id: group.id,
        name: group.name,
        ungrouped: false,
        types: members,
      });
    }
  }
  const ungrouped = sortedTypes.filter(
    (type) => type.groupId === null || !knownGroupIds.has(type.groupId),
  );
  if (ungrouped.length > 0) {
    sections.push({
      id: UNGROUPED_ID,
      name: UNGROUPED_LABEL,
      ungrouped: true,
      types: ungrouped,
    });
  }
  return sections;
}

/**
 * Swap a group with its neighbor in the display-ordered list ("up" = toward
 * the front) and return the re-ranked list (sortOrder = new position) — the
 * same shape `moveInTreeOrder` returns for departments. Returns null when
 * the id is unknown or the group sits at the end in that direction.
 */
export function moveEventTypeGroupOrder(
  groups: readonly EventTypeGroupRef[],
  id: string,
  direction: "up" | "down",
): EventTypeGroupRef[] | null {
  const ordered = sortEventTypeGroups(groups);
  const index = ordered.findIndex((group) => group.id === id);
  if (index === -1) {
    return null;
  }
  const neighborIndex = direction === "up" ? index - 1 : index + 1;
  if (neighborIndex < 0 || neighborIndex >= ordered.length) {
    return null;
  }
  const next = [...ordered];
  [next[index], next[neighborIndex]] = [next[neighborIndex], next[index]];
  return next.map((group, sortOrder) => ({ ...group, sortOrder }));
}
