import { PageContainer } from "@/components/PageContainer";
import { addOneDay, formatInstantToNaive, parseNaiveToInstant } from "@/lib/events/datetime";
import { busyKahsIn, kahGroupsForUser, kahStatusForWindow, resolveUserNames } from "@/lib/kah/status";
import { requireSession } from "@/lib/session";

import { KahStatusView } from "./KahStatusView";

interface KahStatusPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function today(): string {
  return formatInstantToNaive(new Date()).slice(0, 10);
}

export default async function KahStatusPage({ searchParams }: KahStatusPageProps) {
  const session = await requireSession();
  const params = await searchParams;

  // Always opens on today; an explicit ?date= wins (mirrors /parade-state).
  const urlDate =
    typeof params.date === "string" && DATE_PATTERN.test(params.date) ? params.date : null;
  const date = urlDate ?? today();

  const groups = await kahGroupsForUser(session.user.id);

  // The full-day window [date 00:00, next-day 00:00), matching how the rest
  // of the app reads a single day's events.
  const windowStart = parseNaiveToInstant(`${date} 00:00:00`);
  const windowEnd = parseNaiveToInstant(`${addOneDay(date)} 00:00:00`);

  const busy = await busyKahsIn(windowStart, windowEnd);
  const statuses = kahStatusForWindow(groups, busy);

  const awayIds = [...new Set(statuses.flatMap((status) => status.awayIds))];
  const names = await resolveUserNames(awayIds);

  const rows = statuses.map((status) => ({
    groupId: status.groupId,
    name: status.name,
    requiredPct: status.requiredPct,
    actualPct: status.actualPct,
    totalMembers: status.totalMembers,
    breached: status.breached,
    awayNames: status.awayIds.map((id) => names.get(id)).filter((name): name is string => !!name),
  }));

  return (
    <PageContainer>
      <KahStatusView date={date} rows={rows} />
    </PageContainer>
  );
}
