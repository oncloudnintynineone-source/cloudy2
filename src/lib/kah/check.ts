/**
 * Pure KAH constraint math: given the enabled groups and the set of member
 * ids that are "away" (tagged on an event overlapping the checked window),
 * decide which groups fall below their required in-country percentage.
 * Kept free of I/O so it can be unit-tested without a database.
 */

/** A group as the check sees it: identity plus membership, already resolved. */
export interface KahGroupCheck {
  id: string;
  name: string;
  /** Required in-country share of the group, 1–100. */
  minPercentage: number;
  memberIds: string[];
}

/** One group below its threshold after an event mutation. */
export interface KahBreach {
  groupId: string;
  groupName: string;
  requiredPct: number;
  actualPct: number;
  totalMembers: number;
  /** Member ids tagged on overlapping events (the away set of this group). */
  awayIds: string[];
}

/**
 * The in-country share of a group as a floored whole percentage — the same
 * rounding an admin would do reading a parade state, and strictly
 * conservative (5 members with 3 in country = 60%, exactly meeting a 60%
 * requirement; 2/5 = 40% breaches).
 */
export function inCountryPercentage(totalMembers: number, awayCount: number): number {
  if (totalMembers <= 0) {
    return 100;
  }
  const inCountry = Math.max(0, totalMembers - Math.max(0, awayCount));
  return Math.floor((inCountry / totalMembers) * 100);
}

/**
 * Groups whose in-country percentage falls below `minPercentage` for the
 * checked window, in input order. Empty groups never breach (a group with no
 * members has no constraint), duplicate member ids are collapsed, and a
 * required percentage is met exactly at equality (breach is strictly below).
 */
export function computeKahBreaches(
  groups: KahGroupCheck[],
  busyUserIds: ReadonlySet<string>,
): KahBreach[] {
  const breaches: KahBreach[] = [];
  for (const group of groups) {
    const memberIds = [...new Set(group.memberIds)];
    if (memberIds.length === 0) {
      continue;
    }
    const awayIds = memberIds.filter((id) => busyUserIds.has(id));
    const actualPct = inCountryPercentage(memberIds.length, awayIds.length);
    if (actualPct < group.minPercentage) {
      breaches.push({
        groupId: group.id,
        groupName: group.name,
        requiredPct: group.minPercentage,
        actualPct,
        totalMembers: memberIds.length,
        awayIds,
      });
    }
  }
  return breaches;
}
