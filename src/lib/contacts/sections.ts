/**
 * Pure sectioning behind the Contacts page (docs/ui-ux-improvements.md C2):
 * the flat card wall becomes a sectioned, jumpable list — alphabetical by
 * name, or grouped by department — plus the A–Z rail keys derived from the
 * sections. No I/O so it can be unit-tested without a database.
 */

import type { RosterUser } from "@/lib/roster/queries";

/** What the contact list is sorted and sectioned by. */
export type ContactSort = "name" | "department";

export interface ContactSection {
  /** Stable key for DOM ids + rail jumps: a letter, or a department id. */
  key: string;
  label: string;
  users: RosterUser[];
}

/** Section label for roster members without a department (sorted last). */
export const NO_DEPARTMENT_SECTION_LABEL = "No department";

/** Sentinel section key for the department-less group (ids are UUIDs). */
export const NO_DEPARTMENT_SECTION_KEY = "__no-department__";

/** Uppercase A–Z initial of a name; anything else groups under "#". */
export function contactInitial(name: string): string {
  const char = name.trim().charAt(0).toUpperCase();
  return char >= "A" && char <= "Z" ? char : "#";
}

function compareNames(a: RosterUser, b: RosterUser): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

/**
 * Section the (already filtered) contacts for the active sort. Name sort:
 * one section per initial, alphabetical, "#" (non-Latin names) last.
 * Department sort: one section per department, alphabetical by name, the
 * department-less group last; members sort by name inside every section.
 */
export function buildContactSections(
  users: readonly RosterUser[],
  sort: ContactSort,
): ContactSection[] {
  if (sort === "name") {
    const buckets = new Map<string, RosterUser[]>();
    for (const user of [...users].sort(compareNames)) {
      const key = contactInitial(user.name);
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.push(user);
      } else {
        buckets.set(key, [user]);
      }
    }
    const sections = [...buckets].map(([key, bucketUsers]) => ({
      key,
      label: key,
      users: bucketUsers,
    }));
    const hashIndex = sections.findIndex((section) => section.key === "#");
    if (hashIndex >= 0) {
      const [hash] = sections.splice(hashIndex, 1);
      sections.push(hash);
    }
    return sections;
  }

  const buckets = new Map<string, { label: string; users: RosterUser[] }>();
  for (const user of users) {
    const key = user.department?.id ?? NO_DEPARTMENT_SECTION_KEY;
    const label = user.department?.name ?? NO_DEPARTMENT_SECTION_LABEL;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.users.push(user);
    } else {
      buckets.set(key, { label, users: [user] });
    }
  }
  const sections = [...buckets].map(([key, bucket]) => ({
    key,
    label: bucket.label,
    users: [...bucket.users].sort(compareNames),
  }));
  sections.sort((a, b) => {
    if (a.key === NO_DEPARTMENT_SECTION_KEY) return 1;
    if (b.key === NO_DEPARTMENT_SECTION_KEY) return -1;
    return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  });
  return sections;
}

export interface ContactRailKey {
  /** The letter shown on the rail. */
  key: string;
  /** Section jumped to when the letter is tapped. */
  sectionKey: string;
}

/**
 * The A–Z rail: one entry per distinct section initial (in section order),
 * each targeting the first section that starts with that letter. On name
 * sort this is exactly the section list; on department sort it collapses to
 * the departments' initials.
 */
export function buildContactRail(sections: readonly ContactSection[]): ContactRailKey[] {
  const seen = new Set<string>();
  const rail: ContactRailKey[] = [];
  for (const section of sections) {
    const initial = contactInitial(section.label);
    if (!seen.has(initial)) {
      seen.add(initial);
      rail.push({ key: initial, sectionKey: section.key });
    }
  }
  return rail;
}
