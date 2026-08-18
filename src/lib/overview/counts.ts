/**
 * Pure counting for the Overview page: per user, per event type, how many
 * logical events involved that user in a month. Kept free of I/O for unit
 * testing. Input `events` are expected to already be deduped by logical event
 * group id (see `fetchMonthEvents`).
 */

import type { CalendarEvent } from "@/lib/events/queries";

/** User ids an event involves: the creator plus every tagged user, deduped. */
export function involvedUserIds(event: CalendarEvent): string[] {
  const set = new Set<string>();
  const { creatorId, inviteeUserIds } = event.payload;
  if (creatorId) {
    set.add(creatorId);
  }
  for (const userId of inviteeUserIds) {
    set.add(userId);
  }
  return [...set];
}

/**
 * Counts per user per event type for a month. Every row user gets all
 * configured type names (zeroed); events without a parseable type, or with a
 * type outside the configured columns, are not represented anywhere.
 */
export function buildOverviewCounts(params: {
  events: CalendarEvent[];
  userIds: string[];
  typeNames: string[];
}): Map<string, Record<string, number>> {
  const { events, userIds, typeNames } = params;
  const rowUserIds = new Set(userIds);
  const counts = new Map<string, Record<string, number>>();
  for (const userId of userIds) {
    counts.set(userId, Object.fromEntries(typeNames.map((name) => [name, 0])));
  }
  for (const event of events) {
    const eventType = event.payload.eventType;
    if (!eventType) {
      continue;
    }
    for (const userId of involvedUserIds(event)) {
      if (!rowUserIds.has(userId)) {
        continue;
      }
      const row = counts.get(userId);
      if (row && eventType in row) {
        row[eventType] += 1;
      }
    }
  }
  return counts;
}
