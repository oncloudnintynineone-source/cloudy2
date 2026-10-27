/**
 * Wrapper around the lean deep-link target resolver. The dashboard calls it as
 * soon as a `?event=`/`?edit=` link appears, in parallel with the grid read, so
 * the details modal (or edit form) can open without waiting for the whole
 * snapshot. Failures are returned, never thrown: the caller shows the "Could
 * not open that event" advisory.
 *
 * Called by `/api/dashboard/deep-link` (not a server action), so it never sits
 * in the App Router's single-flight server-action queue. Server-only.
 */

import type { CalendarEvent } from "@/lib/events/queries";
import { requireSession } from "@/lib/session";

import { deepLinkViewKind, resolveDeepLinkTarget } from "./deepLinkTarget";

export interface ResolveDeepLinkTargetActionInput {
  /** Logical event group id from the URL (validated server-side). */
  eventId: string;
  /** The link's `?date=` (target start day). */
  date?: string | null;
  /** The tapped copy's calendar id (`_eventCal`). */
  calendarId?: string | null;
  /** The active tab id (`?view=`) — only a title-recipe fallback. */
  view?: string | null;
  /**
   * The active tab's renderer kind, when the caller already knows it (a
   * same-route click). Omitted on a cold load, where the server resolves it
   * from the user's stored tabs.
   */
  viewKind?: string | null;
  /** Bypass the events cache (dashboard force-refresh nonce). */
  force?: boolean;
}

export type ResolveDeepLinkTargetActionResult =
  { ok: true; event: CalendarEvent | null } | { ok: false; error: string };

export async function resolveDeepLinkTargetAction(
  input: ResolveDeepLinkTargetActionInput,
): Promise<ResolveDeepLinkTargetActionResult> {
  // Outside the try: an expired session redirects to /login and must propagate.
  const session = await requireSession();

  try {
    const view = input.view ?? null;
    const viewKind = await deepLinkViewKind(session.user.id, view, input.viewKind);
    const event = await resolveDeepLinkTarget({
      eventId: input.eventId,
      date: input.date ?? null,
      calendarId: input.calendarId ?? null,
      viewKind,
      force: input.force === true,
    });
    return { ok: true, event };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not open that event",
    };
  }
}
