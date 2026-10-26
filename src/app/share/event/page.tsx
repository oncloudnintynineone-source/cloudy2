import { notFound, redirect } from "next/navigation";

import { parseEventShareParams } from "@/lib/events/deepLink";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Public landing route for a shared event link. The URL itself carries the
 * whole target (group id + calendar id + date) — nothing is stored, so there
 * is nothing to revoke; access stays gated by login and the deep-link
 * resolver. Either sends a signed-out visitor through login (returning
 * straight to the dashboard deep link) or the signed-in user to the dashboard,
 * which opens the details modal from the one-shot `?event=` params.
 *
 * Kept outside the `(protected)` layout so the login hop works. The static
 * `event` segment wins over the sibling `/share/[token]` dynamic route.
 */
export default async function SharedEventLandingPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string | string[]; c?: string | string[]; d?: string | string[] }>;
}) {
  const raw = await searchParams;
  const target = parseEventShareParams({
    e: typeof raw.e === "string" ? raw.e : undefined,
    c: typeof raw.c === "string" ? raw.c : undefined,
    d: typeof raw.d === "string" ? raw.d : undefined,
  });
  if (!target) {
    notFound();
  }
  const params = new URLSearchParams();
  params.set("date", target.date);
  params.set("event", target.eventId);
  params.set("_eventCal", target.calendarId);
  const dashboardTarget = `/dashboard?${params.toString()}`;
  const session = await getSession();
  if (!session?.user) {
    redirect(`/login?next=${encodeURIComponent(dashboardTarget)}`);
  }
  redirect(dashboardTarget);
}
