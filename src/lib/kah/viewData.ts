import {
  addOneDay,
  daysBetween,
  formatInstantToNaive,
  parseNaiveToInstant,
} from "@/lib/events/datetime";
import type { EventClashEntry } from "@/lib/events/clashActions";
import {
  kahForwardWindow,
  type KahEpisodeRow,
  type KahRangeMonths,
  type KahStatusViewData,
} from "@/lib/kah/range";
import {
  busyDaysInRange,
  dedupeOverseasEventsByGroupId,
  eventsForGroupEpisode,
  kahBreachEpisodes,
  kahGroupsForUser,
  kahStatusForWindow,
  listKahGroupChecks,
  memberIdsAwayOnEvent,
  overseasEventEntriesInRange,
  resolveUserNames,
  type KahBreachEvent,
} from "@/lib/kah/status";

/**
 * Shape one KAH-causing overseas event into the shared `EventClashEntry` the
 * breach cards render (type-first row label, when-label, calendar). `affected`
 * is the group members that event takes away.
 */
function toBreachEntry(
  event: KahBreachEvent,
  memberIds: ReadonlySet<string>,
  names: Map<string, string>,
): EventClashEntry {
  const affected = memberIdsAwayOnEvent(event, memberIds)
    .map((userId) => ({ userId, name: names.get(userId) ?? "" }))
    .filter((person) => person.name !== "")
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    title: event.title,
    eventId: event.eventId,
    calendarId: event.calendarId,
    googleEventId: event.googleEventId,
    calendarName: event.calendarName,
    startNaive: event.startNaive,
    endNaive: event.endNaive,
    allDay: event.allDay,
    external: event.external,
    affected,
    typeName: event.typeName,
    typeShortname: event.typeShortname,
    rawTitle: event.rawTitle,
    color: event.color,
    occupiesFullDay: event.occupiesFullDay,
    effectiveStartNaive: event.effectiveStartNaive,
    effectiveEndNaive: event.effectiveEndNaive,
    timeOption: event.timeOption,
    startAmPm: event.startAmPm,
    endAmPm: event.endAmPm,
  };
}

/**
 * Build the `/kah-status` view data for a forward-only `[today, end of month
 * +rangeMonths]` window: every group's breach periods (admins: all groups,
 * members: their own), each with its roster and the overseas events behind it,
 * plus the groups that stayed clear. Shared by the page's initial render (the
 * default range) and the range-change server action, so the two can never
 * diverge on the math.
 */
export async function buildKahStatusViewData(input: {
  userId: string;
  role: "admin" | "user";
  rangeMonths: KahRangeMonths;
}): Promise<KahStatusViewData> {
  const isAdmin = input.role === "admin";
  const groups = isAdmin ? await listKahGroupChecks() : await kahGroupsForUser(input.userId);

  const today = formatInstantToNaive(new Date()).slice(0, 10);
  const { windowStart, windowEnd } = kahForwardWindow(today, input.rangeMonths);
  const days = daysBetween(windowStart, windowEnd);

  // One enriched overseas-event read for the whole window through the sanctioned
  // month cache (never raw listEvents) — drives both the per-day status math and
  // the breach cards' event lists.
  const events = await overseasEventEntriesInRange(
    parseNaiveToInstant(`${windowStart} 00:00:00`),
    parseNaiveToInstant(`${addOneDay(windowEnd)} 00:00:00`),
  );

  // Per-day status over the window, reusing the exact single-day math.
  const perDay = busyDaysInRange(events, days).map((day) => ({
    date: day.date,
    statuses: kahStatusForWindow(groups, new Set(day.awayIds)),
  }));
  const episodes = kahBreachEpisodes(perDay, today);

  // Resolve every group member's display name once (the cards list the full
  // roster, away members highlighted).
  const memberIdsByGroup = new Map(groups.map((group) => [group.id, group.memberIds]));
  const allMemberIds = [...new Set(groups.flatMap((group) => group.memberIds))];
  const names = await resolveUserNames(allMemberIds);

  // Cross-calendar copies of one logical event collapse to a single row.
  const dedupedEvents = dedupeOverseasEventsByGroupId(events);

  const episodeRows: KahEpisodeRow[] = episodes.map((episode) => {
    const memberIds = memberIdsByGroup.get(episode.groupId) ?? [];
    const memberIdSet = new Set(memberIds);
    const awaySet = new Set(episode.awayIds);
    const members = memberIds
      .map((userId) => ({ userId, name: names.get(userId) ?? "", away: awaySet.has(userId) }))
      .filter((member) => member.name !== "");
    const causingEvents = eventsForGroupEpisode(
      dedupedEvents,
      memberIdSet,
      parseNaiveToInstant(`${episode.startDate} 00:00:00`),
      parseNaiveToInstant(`${addOneDay(episode.endDate)} 00:00:00`),
    );
    return {
      ...episode,
      totalMembers: memberIds.length,
      members,
      events: causingEvents.map((event) => toBreachEntry(event, memberIdSet, names)),
    };
  });

  // Groups without any breached day in the window are explicitly "all clear".
  const breachedGroupIds = new Set(episodes.map((episode) => episode.groupId));
  const allClearGroups = groups
    .filter((group) => !breachedGroupIds.has(group.id))
    .map((group) => group.name);

  return {
    windowStart,
    windowEnd,
    rangeMonths: input.rangeMonths,
    allGroups: isAdmin,
    episodes: episodeRows,
    allClearGroups,
  };
}
