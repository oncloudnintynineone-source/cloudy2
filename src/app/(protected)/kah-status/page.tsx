import { PageContainer } from "@/components/PageContainer";
import {
  addOneDay,
  daysBetween,
  formatInstantToNaive,
  lastDayOfMonth,
  parseNaiveToInstant,
  shiftMonth,
} from "@/lib/events/datetime";
import {
  busyDaysInRange,
  kahBreachEpisodes,
  kahGroupsForUser,
  kahStatusForWindow,
  listKahGroupChecks,
  overseasEventsInRange,
  resolveUserNames,
} from "@/lib/kah/status";
import { requireSession } from "@/lib/session";

import { KahStatusView } from "./KahStatusView";

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

  // One overseas-event read for the whole window through the sanctioned month
  // cache (never raw listEvents) — the same events the notify check reasons about.
  const overseasEvents = await overseasEventsInRange(
    parseNaiveToInstant(`${windowStart} 00:00:00`),
    parseNaiveToInstant(`${addOneDay(windowEnd)} 00:00:00`),
  );

  // Per-day status over the window, reusing the exact single-day math.
  const perDay = busyDaysInRange(overseasEvents, days).map((day) => ({
    date: day.date,
    statuses: kahStatusForWindow(groups, new Set(day.awayIds)),
  }));
  const episodes = kahBreachEpisodes(perDay, today);

  // Resolve the away members' display names once for every episode.
  const awayIds = [...new Set(episodes.flatMap((episode) => episode.awayIds))];
  const names = await resolveUserNames(awayIds);

  const episodeRows = episodes.map((episode) => ({
    ...episode,
    awayNames: episode.awayIds
      .map((id) => names.get(id))
      .filter((name): name is string => !!name),
  }));

  // Groups without any breached day in the window are explicitly "all clear".
  const breachedGroupIds = new Set(episodes.map((episode) => episode.groupId));
  const allClearGroups = groups
    .filter((group) => !breachedGroupIds.has(group.id))
    .map((group) => group.name);

  return (
    <PageContainer>
      <KahStatusView
        windowStart={windowStart}
        windowEnd={windowEnd}
        allGroups={isAdmin}
        episodes={episodeRows}
        allClearGroups={allClearGroups}
      />
    </PageContainer>
  );
}
