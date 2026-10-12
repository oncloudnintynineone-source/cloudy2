import { PageContainer } from "@/components/PageContainer";
import { PageTransition } from "@/components/PageTransition";
import { listEventHistory } from "@/lib/audit/queries";
import { createdEventSummary } from "@/lib/events/history";
import { getSettings } from "@/lib/settings/queries";
import { requireSession } from "@/lib/session";

import { EventHistoryView } from "./EventHistoryView";

interface EventHistoryPageProps {
  params: Promise<{ eventId: string }>;
}

/**
 * The per-event history route: every recorded audit row (create / update /
 * delete) for one logical event, keyed by its group id. Any signed-in user may
 * view it — the same visibility rule as the event itself (docs/event-history.md,
 * docs/roster-sharing.md: grants never gate dashboard reads).
 */
export default async function EventHistoryPage({ params }: EventHistoryPageProps) {
  await requireSession();
  const { eventId } = await params;

  const settings = await getSettings();
  const events = await listEventHistory(eventId, settings.auditLogRetentionDays);

  const newest = events[events.length - 1];
  const title =
    newest?.entityName ?? (newest ? createdEventSummary(newest.details)?.title : null) ?? "Event history";

  // Stamped into the payload so the client can tell a live render from a cache
  // replay and force one fresh read (see `useLiveRouteRefresh`).
  // eslint-disable-next-line react-hooks/purity
  const renderedAt = Date.now();

  return (
    <PageTransition>
      <PageContainer>
        <EventHistoryView
          title={title}
          events={events}
          renderedAt={renderedAt}
          retentionDays={settings.auditLogRetentionDays}
          backHref="/dashboard"
        />
      </PageContainer>
    </PageTransition>
  );
}
