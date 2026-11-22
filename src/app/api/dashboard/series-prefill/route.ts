import { apiError, apiJson, optionalString, withApiJson } from "@/lib/api/server";
import type { EventRef } from "@/lib/events/targets";
import {
  loadEventSeriesPrefill,
  type SeriesPrefillScope,
} from "@/lib/events/seriesPrefill";

/**
 * Read-only series prefill for the recurring-event edit-scope chooser. A route
 * handler (not a server action) so opening the chooser never queues behind a
 * save, and the client can abort it when the dialog closes.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface SeriesPrefillBody {
  ref?: unknown;
  scope?: unknown;
}

function optionalStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function optionalStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Validate the minimal event ref the prefill needs. */
function parseEventRef(value: unknown): EventRef | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const ref = value as Record<string, unknown>;
  if (
    typeof ref.calendarId !== "string" ||
    ref.calendarId.length === 0 ||
    typeof ref.googleEventId !== "string" ||
    ref.googleEventId.length === 0
  ) {
    return null;
  }
  return {
    calendarId: ref.calendarId,
    googleEventId: ref.googleEventId,
    eventId: optionalStringOrNull(ref.eventId),
    start: typeof ref.start === "string" ? ref.start : "",
    end: typeof ref.end === "string" ? ref.end : "",
    allDay: ref.allDay === true,
    creatorId: optionalStringOrNull(ref.creatorId),
    inviteeUserIds: optionalStringArray(ref.inviteeUserIds),
    inviteeDepartmentIds: optionalStringArray(ref.inviteeDepartmentIds),
    ownerOnlyEdits: ref.ownerOnlyEdits === true,
    registrationEnabled: ref.registrationEnabled === true,
    recurringEventId: optionalStringOrNull(ref.recurringEventId),
    originalStartTime: optionalStringOrNull(ref.originalStartTime),
  };
}

export async function POST(request: Request) {
  const auth = await withApiJson<SeriesPrefillBody>(request);
  if (!auth.ok) {
    return auth.response;
  }
  const ref = parseEventRef(auth.body.ref);
  const scope = optionalString(auth.body.scope);
  if (!ref || (scope !== "series" && scope !== "following")) {
    return apiError(400, "Invalid request");
  }
  const result = await loadEventSeriesPrefill(ref, scope as SeriesPrefillScope);
  return apiJson(result);
}
