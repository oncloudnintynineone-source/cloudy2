import {
  addOneDay,
  daysBetween,
  formatInstantToNaive,
  parseNaiveToInstant,
} from "@/lib/events/datetime";
import type { EventClashEntry } from "@/lib/events/clashActions";
import {
  groupBreachState,
  groupNextBreachDate,
  groupWorst,
  awaySpansByMember,
} from "@/lib/kah/groups";
import {
  kahForwardWindow,
  type KahEpisodeRow,
  type KahGroupMemberRow,
  type KahGroupRow,
  type KahMemberRef,
  type KahRangeMonths,
  type KahStatusViewData,
} from "@/lib/kah/range";
import {
  busyDaysInRange,
  dedupeOverseasEventsByGroupId,
  eventsForGroupEpisode,
  kahBreachEpisodes,
  kahGroupIdsForUser,
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

/** `[{ userId, name }]` for an id list, dropping ids with no roster name. */
function namedMembers(ids: readonly string[], names: Map<string, string>): KahMemberRef[] {
  return ids
    .map((userId) => ({ userId, name: names.get(userId) ?? "" }))
    .filter((member) => member.name !== "")
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Rank groups so the ones needing attention come first, then alphabetically. */
const GROUP_STATE_RANK = { active: 0, upcoming: 1, clear: 2 } as const;

/**
 * Build the `/kah-status` view data for a forward-only `[today, end of month
 * +rangeMonths]` window. **Every** KAH group is listed for every viewer (the
 * page is gated to KAH members and admins), with each group's full roster and
 * away calendar plus its breach periods. Shared by the page's initial render
 * (the default range) and the range-change server action, so the two can never
 * diverge on the math.
 */
export async function buildKahStatusViewData(input: {
  userId: string;
  role: "admin" | "user";
  rangeMonths: KahRangeMonths;
}): Promise<KahStatusViewData> {
  const isAdmin = input.role === "admin";
  // All groups are visible to every KAH member; the viewer's own memberships
  // only mark which cards are "Your group".
  const [groups, viewerGroupIds] = await Promise.all([
    listKahGroupChecks(),
    kahGroupIdsForUser(input.userId),
  ]);

  const today = formatInstantToNaive(new Date()).slice(0, 10);
  const { windowStart, windowEnd } = kahForwardWindow(today, input.rangeMonths);
  const days = daysBetween(windowStart, windowEnd);

  // One enriched overseas-event read for the whole window through the sanctioned
  // month cache (never raw listEvents) — drives both the per-day status math and
  // the group cards' away calendars/breach event lists.
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
    const awayMembers = namedMembers(episode.awayIds, names);
    const causingEvents = eventsForGroupEpisode(
      dedupedEvents,
      memberIdSet,
      parseNaiveToInstant(`${episode.startDate} 00:00:00`),
      parseNaiveToInstant(`${addOneDay(episode.endDate)} 00:00:00`),
    );
    return {
      ...episode,
      totalMembers: memberIds.length,
      awayMembers,
      events: causingEvents.map((event) => toBreachEntry(event, memberIdSet, names)),
    };
  });

  const episodesByGroup = new Map<string, KahEpisodeRow[]>();
  for (const row of episodeRows) {
    const rows = episodesByGroup.get(row.groupId) ?? [];
    rows.push(row);
    episodesByGroup.set(row.groupId, rows);
  }

  // Today is the first scanned day; its per-group status supplies the cards'
  // "as of today" reading (the forward window has no earlier day).
  const todayStatusByGroup = new Map(
    (perDay[0]?.statuses ?? []).map((status) => [status.groupId, status]),
  );

  // Members' away calendars from the events already read (clipped to the
  // window, merged per trip) — no extra calendar round trips.
  const spansByMember = awaySpansByMember(events, allMemberIds, windowStart, windowEnd);

  const groupRows: KahGroupRow[] = groups.map((group) => {
    const groupEpisodes = episodesByGroup.get(group.id) ?? [];
    const todayStatus = todayStatusByGroup.get(group.id);
    const awayToday = new Set(todayStatus?.awayIds ?? []);
    const members: KahGroupMemberRow[] = namedMembers(group.memberIds, names).map((member) => ({
      userId: member.userId,
      name: member.name,
      awayToday: awayToday.has(member.userId),
      spans: spansByMember.get(member.userId) ?? [],
    }));
    const worst = groupWorst(groupEpisodes);
    return {
      groupId: group.id,
      name: group.name,
      requiredPct: group.minPercentage,
      totalMembers: group.memberIds.length,
      todayPct: todayStatus?.actualPct ?? 100,
      members,
      state: groupBreachState(groupEpisodes),
      worstPct: worst?.pct ?? null,
      worstDate: worst?.date ?? null,
      nextBreachDate: groupNextBreachDate(groupEpisodes),
      isMember: viewerGroupIds.has(group.id),
    };
  });

  // Attention first: active breaches, then upcoming ones, then clear groups;
  // alphabetical inside each band (the group reads are already name-ordered).
  groupRows.sort((a, b) => {
    const rank = GROUP_STATE_RANK[a.state] - GROUP_STATE_RANK[b.state];
    return rank !== 0 ? rank : a.name.localeCompare(b.name);
  });

  return {
    windowStart,
    windowEnd,
    rangeMonths: input.rangeMonths,
    isAdmin,
    groups: groupRows,
    episodes: episodeRows,
  };
}
