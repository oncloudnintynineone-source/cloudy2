"use server";

import { buildMyEventsPage, type MyEventsPageData } from "@/lib/events/myEventsData";
import { parseMyEventsRange } from "@/lib/events/myEventsRange";
import { requireSession } from "@/lib/session";

export type MyEventsPageResult =
  | { ok: true; data: MyEventsPageData }
  | { ok: false; error: string };

/**
 * Rebuild the My Events page for a newly selected window, page number or
 * title search, so a change applies in place instead of navigating
 * (docs/event-history.md §1.4.3). The route renders the first page; this
 * action serves every change after it through the same `buildMyEventsPage`,
 * so the two agree exactly.
 *
 * All inputs are untrusted: the window is coerced with `parseMyEventsRange`
 * (default on garbage), the page clamped to a positive integer, and the
 * search trimmed and length-capped — the builder clamps the page again
 * against the real page count. Always the caller's own events: the user id
 * comes from the session, never from the input.
 */
export async function getMyEventsPage(input: {
  rangeMonths: number;
  page: number;
  q?: string;
}): Promise<MyEventsPageResult> {
  const session = await requireSession();
  try {
    const page =
      Number.isFinite(input.page) && input.page >= 1 ? Math.floor(input.page) : 1;
    const data = await buildMyEventsPage({
      userId: session.user.id,
      rangeMonths: parseMyEventsRange(input.rangeMonths),
      page,
      q: typeof input.q === "string" ? input.q.trim().slice(0, 100) : null,
    });
    return { ok: true, data };
  } catch (error) {
    console.error("[my-events] Page rebuild failed", error);
    return { ok: false, error: "Could not load your events" };
  }
}
