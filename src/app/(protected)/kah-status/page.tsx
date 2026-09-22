import { PageContainer } from "@/components/PageContainer";
import { PageTransition } from "@/components/PageTransition";
import {
  addOneDay,
  daysBetween,
  formatInstantToNaive,
  lastDayOfMonth,
  parseNaiveToInstant,
  shiftMonth,
} from "@/lib/events/datetime";
import type { EventClashEntry } from "@/lib/events/clashActions";
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
import { requireSession } from "@/lib/session";

import { KahStatusView } from "./KahStatusView";

/**
 * Shape one KAH-causing overseas event into the shared `EventClashEntry` the
 * Double Booking card components render (type-first row label, when-label,
 * calendar). `affected` is the group members that event takes away.
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

export default async function KahStatusPage() {
  const session = await requireSession();

  // Admins see the page unconditionally with every group; members only their own.
  const isAdmin = session.user.role === "admin";
  const groups = isAdmin ? await listKahGroupChecks() : await kahGroupsForUser(session.user.id);

  // Month-aligned ±3-month window centered on today: the 1st of the month 3
  // months back through the last day of the month 3 months ahead. Today is the
  // resolution anchor (a run that ended before today is resolved).
  const today = formatInstantToNaive(new Date()).slice(0, 10);
  const todayMonth = today.slice(0, 7);
  const windowStart = `${shiftMonth(todayMonth, -3)}-01`;
  const windowEnd = lastDayOfMonth(shiftMonth(todayMonth, 3));
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

  const episodeRows = episodes.map((episode) => {
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

  return (
    <PageTransition>
      <PageContainer>
        <KahStatusView
          windowStart={windowStart}
          windowEnd={windowEnd}
          allGroups={isAdmin}
          currentUserId={session.user.id}
          episodes={episodeRows}
          allClearGroups={allClearGroups}
        />
      </PageContainer>
    </PageTransition>
  );
}
