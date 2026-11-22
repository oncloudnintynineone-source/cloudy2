import { PageContainer } from "@/components/PageContainer";
import { PageTransition } from "@/components/PageTransition";
import { parsePage } from "@/lib/audit/queries";
import { buildMyEventsPage, MY_EVENTS_PAGE_SIZE } from "@/lib/events/myEventsData";
import { parseMyEventsRange } from "@/lib/events/myEventsRange";
import { requireSession } from "@/lib/session";

import { MyEventsView } from "./MyEventsView";

interface MyEventsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * "My Events": the signed-in user's own organized events over an adjustable
 * ±-months window, including those since deleted. Built from a union of a live
 * all-calendar read (organizer = the user) and the user's event audit rows —
 * never any other user's rows. See docs/event-history.md.
 *
 * A thin shell: the whole page is `buildMyEventsPage`, the same builder the
 * `getMyEventsPage` action runs, so changing the window or the page number
 * re-renders in place instead of navigating back through this route.
 */
export default async function MyEventsPage({ searchParams }: MyEventsPageProps) {
  const session = await requireSession();
  const params = await searchParams;

  const data = await buildMyEventsPage({
    userId: session.user.id,
    rangeMonths: parseMyEventsRange(typeof params.range === "string" ? params.range : null),
    page: parsePage(typeof params.page === "string" ? params.page : null),
    pageSize: MY_EVENTS_PAGE_SIZE,
    q: typeof params.q === "string" ? params.q.trim().slice(0, 100) : null,
  });

  return (
    <PageTransition>
      <PageContainer>
        <MyEventsView
          items={data.items}
          page={data.page}
          pageCount={data.pageCount}
          total={data.total}
          rangeMonths={data.rangeMonths}
          q={data.q}
          retentionDays={data.retentionDays}
          renderedAt={data.renderedAt}
        />
      </PageContainer>
    </PageTransition>
  );
}
