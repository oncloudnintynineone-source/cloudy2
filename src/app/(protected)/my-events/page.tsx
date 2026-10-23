import { PageContainer } from "@/components/PageContainer";
import { PageTransition } from "@/components/PageTransition";
import { listEventAuditTrail, parsePage } from "@/lib/audit/queries";
import { buildChangeTrail, groupTrailRows } from "@/lib/events/changeTrail";
import { buildMyEventsData } from "@/lib/events/myEventsData";
import { parseMyEventsRange } from "@/lib/events/myEventsRange";
import { getSettings } from "@/lib/settings/queries";
import { requireSession } from "@/lib/session";

import { MyEventsView } from "./MyEventsView";

const MY_EVENTS_PAGE_SIZE = 20;

interface MyEventsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * "My Events": the signed-in user's own organized events over an adjustable
 * ±-months window, including those since deleted. Built from a union of a live
 * all-calendar read (organizer = the user) and the user's event audit rows —
 * never any other user's rows. See docs/event-history.md.
 */
export default async function MyEventsPage({ searchParams }: MyEventsPageProps) {
  const session = await requireSession();
  const params = await searchParams;
  const rangeMonths = parseMyEventsRange(typeof params.range === "string" ? params.range : null);
  const requestedPage = parsePage(typeof params.page === "string" ? params.page : null);

  const settings = await getSettings();
  const data = await buildMyEventsData({ userId: session.user.id, rangeMonths });

  const total = data.rows.length;
  const pageCount = Math.max(1, Math.ceil(total / MY_EVENTS_PAGE_SIZE));
  const page = Math.min(Math.max(requestedPage, 1), pageCount);
  const offset = (page - 1) * MY_EVENTS_PAGE_SIZE;
  const pageRows = data.rows.slice(offset, offset + MY_EVENTS_PAGE_SIZE);

  // Stamped into the payload so the client can tell a live render from a cache
  // replay and force one fresh read (see `useLiveRouteRefresh`).
  // eslint-disable-next-line react-hooks/purity
  const renderedAt = Date.now();

  // One indexed read for the whole page's inline change timelines
  // (docs/event-history.md §1.4.1): every create/update/delete row of the
  // events on this page, collapsed per event by the pure trail builder.
  const trailRows = await listEventAuditTrail(
    pageRows
      .map((row) => row.eventId)
      .filter((eventId): eventId is string => eventId !== null),
    settings.auditLogRetentionDays,
  );
  const trailByEvent = groupTrailRows(trailRows);
  const now = new Date(renderedAt);
  const items = pageRows.map((row) =>
    row.eventId
      ? { ...row, trail: buildChangeTrail(trailByEvent.get(row.eventId) ?? [], now) }
      : row,
  );

  return (
    <PageTransition>
      <PageContainer>
        <MyEventsView
          items={items}
          page={page}
          pageCount={pageCount}
          total={total}
          rangeMonths={data.rangeMonths}
          retentionDays={settings.auditLogRetentionDays}
          renderedAt={renderedAt}
        />
      </PageContainer>
    </PageTransition>
  );
}
