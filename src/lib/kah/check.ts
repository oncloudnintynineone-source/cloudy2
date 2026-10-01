/**
 * Pure KAH constraint math: given the enabled groups, the overseas events
 * overlapping the checked window, and the tagged attendees of the event being
 * saved, decide which groups fall below their required in-country percentage.
 * Kept free of I/O so it can be unit-tested without a database.
 *
 * Two rules make a mutation a *causal* trigger rather than a blanket rescan:
 * - The saved event must itself be overseas and tag a member of the group;
 *   an unrelated (or non-overseas) event can never notify a group.
 * - Each breach carries the union window of the overseas events that put its
 *   members away — the stable identity the caller dedups on, so the same
 *   underlying absence notifies once no matter which event is saved.
 */

/** A group as the check sees it: identity plus membership, already resolved. */
export interface KahGroupCheck {
  id: string;
  name: string;
  /** Required in-country share of the group, 1–100. */
  minPercentage: number;
  memberIds: string[];
}

/** An overseas event's effective occupancy and the attendees it takes away. */
export interface KahAwayEvent {
  /** Inclusive start of the event's effective (SGT-aligned) occupancy. */
  start: Date;
  /** Exclusive end of the effective occupancy window. */
  end: Date;
  /** Ids of tagged attendees (the organizer counts only when among them). */
  userIds: string[];
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
  /**
   * Union window `[start, end)` of the overseas events that made this group's
   * members away — the dedup identity (same absence → same window).
   */
  awayWindowStart: Date;
  awayWindowEnd: Date;
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
 * Groups the saved event can affect and that end up below `minPercentage` for
 * the checked window, in input order. A group is only considered when the
 * saved event tags at least one of its members — an event that takes nobody
 * away cannot change a group's status, so it must never notify. The away set
 * is the group's members tagged on any overseas event overlapping the window;
 * the away window is the union of those events' occupancy, used for dedup.
 *
 * Empty groups never breach (a group with no members has no constraint),
 * duplicate member ids are collapsed, and a required percentage is met exactly
 * at equality (breach is strictly below).
 */
export function computeKahBreaches(
  groups: KahGroupCheck[],
  events: readonly KahAwayEvent[],
  savedEventUserIds: ReadonlySet<string>,
): KahBreach[] {
  const breaches: KahBreach[] = [];
  for (const group of groups) {
    const memberIds = [...new Set(group.memberIds)];
    if (memberIds.length === 0) {
      continue;
    }
    // Scope gate: the saved event must take one of this group's members away.
    if (!memberIds.some((id) => savedEventUserIds.has(id))) {
      continue;
    }
    const memberSet = new Set(memberIds);
    const contributing = events.filter((event) =>
      event.userIds.some((id) => memberSet.has(id)),
    );
    if (contributing.length === 0) {
      continue;
    }
    const awayIds = [...new Set(contributing.flatMap((event) => event.userIds))].filter((id) =>
      memberSet.has(id),
    );
    const actualPct = inCountryPercentage(memberIds.length, awayIds.length);
    if (actualPct >= group.minPercentage) {
      continue;
    }
    let awayWindowStart = contributing[0].start;
    let awayWindowEnd = contributing[0].end;
    for (const event of contributing) {
      if (event.start < awayWindowStart) {
        awayWindowStart = event.start;
      }
      if (event.end > awayWindowEnd) {
        awayWindowEnd = event.end;
      }
    }
    breaches.push({
      groupId: group.id,
      groupName: group.name,
      requiredPct: group.minPercentage,
      actualPct,
      totalMembers: memberIds.length,
      awayIds,
      awayWindowStart,
      awayWindowEnd,
    });
  }
  return breaches;
}
