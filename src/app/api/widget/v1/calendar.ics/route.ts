import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { userPreferences, users } from "@/db/schema";
import { API_NO_STORE } from "@/lib/api/server";
import { appBaseUrl } from "@/lib/appUrl";
import { getDashboardViews } from "@/lib/dashboardViews/queries";
import { isUuid } from "@/lib/uuid";
import { buildCalendarFeedCached } from "@/lib/widgets/feedCache";
import {
  feedTokenSecret,
  parseFeedVersion,
  verifyFeedSignature,
} from "@/lib/widgets/feedToken";
import { checkWidgetRateLimit } from "@/lib/widgets/rateLimit";

/**
 * Signed, read-only calendar-feed subscription (docs/calendar-feed.md).
 *
 * Calendar apps cannot send an Authorization header and store the subscription
 * URL, so the URL itself is the credential: an HMAC over
 * `(userId, feed_version, viewId)` keyed by `NEXTAUTH_SECRET`. Rotating the
 * feed link in Profile → Calendar feed increments the version and invalidates
 * every previously generated URL.
 *
 * The rendered ICS body is cached per user+view (feedCache.ts) because a ±3
 * month feed is an eight-month read; calendar apps poll on their own schedule.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ICS_HEADERS = {
  "Content-Type": "text/calendar; charset=utf-8",
  "Content-Disposition": 'inline; filename="cloudy2.ics"',
  // Revalidate on every poll (the server-side widget_feed_cache does the costly
  // part) so a view's filter edit shows up on the calendar app's next fetch.
  "Cache-Control": "private, max-age=0, must-revalidate",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

function unauthorized(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Unauthorized" },
    { status: 401, headers: API_NO_STORE },
  );
}

function tooManyRequests(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Too many requests" },
    { status: 429, headers: { ...API_NO_STORE, "Retry-After": String(retryAfterSec) } },
  );
}

function serverError(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Could not load the calendar feed" },
    { status: 500, headers: API_NO_STORE },
  );
}

export async function GET(request: Request) {
  const secret = feedTokenSecret();
  if (!secret) {
    return serverError();
  }

  const url = new URL(request.url);
  const userId = url.searchParams.get("u");
  const viewId = url.searchParams.get("view");
  const version = parseFeedVersion(url.searchParams.get("v"));
  const signature = url.searchParams.get("sig");

  if (!userId || !viewId || !isUuid(userId) || !isUuid(viewId) || version === null) {
    return unauthorized();
  }
  if (!verifyFeedSignature({ secret, userId, version, viewId, signature })) {
    return unauthorized();
  }

  const limit = checkWidgetRateLimit(`feed:${userId}`);
  if (!limit.allowed) {
    return tooManyRequests(limit.retryAfterSec);
  }

  let row:
    | { status: "active" | "inactive"; role: "admin" | "user"; feedVersion: number | null }
    | undefined;
  try {
    [row] = await db
      .select({
        status: users.status,
        role: users.role,
        feedVersion: userPreferences.feedVersion,
      })
      .from(users)
      .leftJoin(userPreferences, eq(userPreferences.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1);
  } catch (error) {
    console.error("[widgets] Calendar feed auth lookup failed", error);
    return serverError();
  }

  if (!row || row.status !== "active" || (row.feedVersion ?? 0) !== version) {
    return unauthorized();
  }

  // Only views the account created itself can be subscribed. Share imports are
  // ineligible (the dialog never signs them) and any URL generated before that
  // rule existed must stop working. A missing view id keeps the documented
  // deleted-view fallback to the user's first tab.
  let createdVia: "manual" | "shared" | undefined;
  try {
    const tabs = await getDashboardViews(userId);
    createdVia = tabs.find((tab) => tab.id === viewId)?.createdVia;
  } catch (error) {
    console.error("[widgets] Calendar feed view lookup failed", error);
    return serverError();
  }
  if (createdVia === "shared") {
    return unauthorized();
  }

  try {
    const origin = await appBaseUrl();
    const body = await buildCalendarFeedCached({
      actor: { id: userId, role: row.role },
      viewId,
      origin,
    });
    return new NextResponse(body, { headers: ICS_HEADERS });
  } catch (error) {
    console.error("[widgets] Calendar feed build failed", error);
    return serverError();
  }
}
