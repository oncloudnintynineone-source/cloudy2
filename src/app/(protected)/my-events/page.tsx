import { PageContainer } from "@/components/PageContainer";
import { PageTransition } from "@/components/PageTransition";
import {
  AUDIT_PAGE_SIZE,
  countMyCreatedEvents,
  deletedEventIds,
  listMyCreatedEvents,
  parsePage,
} from "@/lib/audit/queries";
import { createdEventSummary } from "@/lib/events/history";
import { getSettings } from "@/lib/settings/queries";
import { requireSession } from "@/lib/session";

import { MyEventsView, type MyEventItem } from "./MyEventsView";

interface MyEventsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * "My Events": the signed-in user's own created events, including those since
 * deleted. Built from the user's `event.create` audit rows (the create actor is
 * always the fixed organizer) — never any other user's rows. See
 * docs/event-history.md.
 */
export default async function MyEventsPage({ searchParams }: MyEventsPageProps) {
  const session = await requireSession();
  const params = await searchParams;
  const requestedPage = parsePage(typeof params.page === "string" ? params.page : null);

  const settings = await getSettings();
  const total = await countMyCreatedEvents(session.user.id);
  const pageCount = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const page = Math.min(Math.max(requestedPage, 1), pageCount);
  const offset = (page - 1) * AUDIT_PAGE_SIZE;

  const rows = await listMyCreatedEvents(session.user.id, {
    offset,
    pageSize: AUDIT_PAGE_SIZE,
  });

  const summaries = rows.flatMap((row) => {
    const summary = createdEventSummary(row.details);
    return summary === null ? [] : [{ id: row.id, eventId: summary.eventId, createdAt: row.createdAt, summary }];
  });
  const deleted = await deletedEventIds(summaries.map((entry) => entry.eventId));
  const items: MyEventItem[] = summaries.map((entry) => ({
    ...entry,
    deleted: deleted.has(entry.eventId),
  }));

  // Stamped into the payload so the client can tell a live render from a cache
  // replay and force one fresh read (see `useLiveRouteRefresh`).
  // eslint-disable-next-line react-hooks/purity
  const renderedAt = Date.now();

  return (
    <PageTransition>
      <PageContainer>
        <MyEventsView
          items={items}
          page={page}
          pageCount={pageCount}
          total={total}
          retentionDays={settings.auditLogRetentionDays}
          renderedAt={renderedAt}
        />
      </PageContainer>
    </PageTransition>
  );
}
