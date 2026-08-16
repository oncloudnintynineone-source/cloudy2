"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { calendars } from "@/db/schema";
import { AUDIT_ACTIONS, actorFromUser } from "@/lib/audit/build";
import { logAction } from "@/lib/audit/log";
import { addOneDay, dateToUtc, parseNaiveToInstant } from "@/lib/events/datetime";
import { encodeEventNotes } from "@/lib/events/notes";
import { getUserDepartmentId } from "@/lib/events/queries";
import { validateEventForm, type EventFormValues } from "@/lib/events/validate";
import { getGoogleIntegration, googleCalendarConfigured, type GcalEventInput } from "@/lib/google";
import { resolveGoogleCalendarId } from "@/lib/roster/shares";
import { requireSession } from "@/lib/session";

export type EventActionResult =
  | { ok: true }
  | { ok: false; error: string; field?: "title" | "start" | "end" | "calendarId" };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Google Calendar request failed";
}

function actorFrom(session: Awaited<ReturnType<typeof requireSession>>) {
  return actorFromUser({
    id: session.user.id,
    name: session.user.name ?? null,
    role: session.user.role,
  });
}

/**
 * The calendar a new/edited event should target. Admins pick any registry
 * calendar; regular users always target their own department.
 */
async function resolveTargetCalendarId(
  session: Awaited<ReturnType<typeof requireSession>>,
  requested: string,
): Promise<string | null> {
  if (session.user.role === "admin") {
    if (!requested) {
      return null;
    }
    const [calendar] = await db
      .select({ id: calendars.id })
      .from(calendars)
      .where(eq(calendars.id, requested))
      .limit(1);
    return calendar?.id ?? null;
  }
  return getUserDepartmentId(session.user.id);
}

function buildGcalEventInput(googleCalendarId: string, input: EventFormValues): GcalEventInput {
  const title = input.title.trim();
  const description = encodeEventNotes({ eventType: input.eventType || undefined });

  if (input.allDay) {
    const startDate = input.start.slice(0, 10);
    const endDate = input.end.slice(0, 10);
    return {
      calendarId: googleCalendarId,
      title,
      description,
      allDay: true,
      start: dateToUtc(startDate),
      end: dateToUtc(addOneDay(endDate)),
    };
  }

  return {
    calendarId: googleCalendarId,
    title,
    description,
    allDay: false,
    start: parseNaiveToInstant(input.start),
    end: parseNaiveToInstant(input.end),
  };
}

export async function createEvent(input: EventFormValues): Promise<EventActionResult> {
  const session = await requireSession();

  const errors = validateEventForm(input);
  if (Object.keys(errors).length > 0) {
    return { ok: false, error: "Check the highlighted fields", field: "title" };
  }

  const calendarId = await resolveTargetCalendarId(session, input.calendarId);
  if (!calendarId) {
    return {
      ok: false,
      error:
        session.user.role === "admin"
          ? "Select a calendar"
          : "You are not assigned to a department",
      field: "calendarId",
    };
  }

  if (!googleCalendarConfigured()) {
    return { ok: false, error: "Google Calendar is not configured", field: "calendarId" };
  }

  const googleCalendarId = await resolveGoogleCalendarId(calendarId);
  if (!googleCalendarId) {
    return { ok: false, error: "Calendar not found", field: "calendarId" };
  }

  try {
    const integration = await getGoogleIntegration();
    const created = await integration.createEvent(buildGcalEventInput(googleCalendarId, input));
    await logAction({
      ...actorFrom(session),
      action: AUDIT_ACTIONS.eventCreate,
      entityType: "calendar",
      entityId: calendarId,
      entityName: input.title.trim(),
      method: "createEvent",
      details: { googleEventId: created.id, eventType: input.eventType || null },
    });
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateEvent(
  googleEventId: string,
  input: EventFormValues,
): Promise<EventActionResult> {
  const session = await requireSession();

  const errors = validateEventForm(input);
  if (Object.keys(errors).length > 0) {
    return { ok: false, error: "Check the highlighted fields", field: "title" };
  }

  const calendarId = await resolveTargetCalendarId(session, input.calendarId);
  if (!calendarId) {
    return { ok: false, error: "Calendar not found", field: "calendarId" };
  }

  if (!googleCalendarConfigured()) {
    return { ok: false, error: "Google Calendar is not configured", field: "calendarId" };
  }

  const googleCalendarId = await resolveGoogleCalendarId(calendarId);
  if (!googleCalendarId) {
    return { ok: false, error: "Calendar not found", field: "calendarId" };
  }

  try {
    const integration = await getGoogleIntegration();
    await integration.updateEvent(
      googleEventId,
      buildGcalEventInput(googleCalendarId, input),
    );
    await logAction({
      ...actorFrom(session),
      action: AUDIT_ACTIONS.eventUpdate,
      entityType: "calendar",
      entityId: calendarId,
      entityName: input.title.trim(),
      method: "updateEvent",
      details: { googleEventId, eventType: input.eventType || null },
    });
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteEvent(input: {
  calendarId: string;
  googleEventId: string;
}): Promise<EventActionResult> {
  const session = await requireSession();

  if (!googleCalendarConfigured()) {
    return { ok: false, error: "Google Calendar is not configured" };
  }

  const googleCalendarId = await resolveGoogleCalendarId(input.calendarId);
  if (!googleCalendarId) {
    return { ok: false, error: "Calendar not found" };
  }

  try {
    const integration = await getGoogleIntegration();
    await integration.deleteEvent(googleCalendarId, input.googleEventId);
    await logAction({
      ...actorFrom(session),
      action: AUDIT_ACTIONS.eventDelete,
      entityType: "calendar",
      entityId: input.calendarId,
      entityName: input.googleEventId,
      method: "deleteEvent",
      details: { googleEventId: input.googleEventId },
    });
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}
