"use server";

import { inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { calendars } from "@/db/schema";
import { AUDIT_ACTIONS, actorFromUser } from "@/lib/audit/build";
import { logAction } from "@/lib/audit/log";
import { absEventRange } from "@/lib/events/datetime";
import { encodeEventNotes, parseEventPeople } from "@/lib/events/notes";
import { getUserDepartmentIds } from "@/lib/events/queries";
import {
  deriveTargetCalendarIds,
  type EventRef,
} from "@/lib/events/targets";
import { validateEventForm, type EventFormValues } from "@/lib/events/validate";
import { getGoogleIntegration, googleCalendarConfigured, type GcalEventInput } from "@/lib/google";
import { getUsersByIds } from "@/lib/roster/queries";
import { resolveGoogleCalendarId } from "@/lib/roster/shares";
import { formatEventTitle, type EventTitlePerson } from "@/lib/settings/formatEventTitle";
import { formatFullName } from "@/lib/settings/formatName";
import { getSettings } from "@/lib/settings/queries";
import { requireSession } from "@/lib/session";

export type EventActionResult =
  | { ok: true }
  | { ok: false; error: string; field?: "title" | "start" | "end" };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Google Calendar request failed";
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function actorFrom(session: Awaited<ReturnType<typeof requireSession>>) {
  return actorFromUser({
    id: session.user.id,
    name: session.user.name ?? null,
    role: session.user.role,
  });
}

interface AbsRange {
  start: Date;
  end: Date;
}

function unionRange(a: AbsRange, b: AbsRange): AbsRange {
  return {
    start: new Date(Math.min(a.start.getTime(), b.start.getTime())),
    end: new Date(Math.max(a.end.getTime(), b.end.getTime())),
  };
}

/** Grow a range by a day each side so copies drifted slightly in Google are still found. */
function withMargin(range: AbsRange): AbsRange {
  const marginMs = 24 * 60 * 60 * 1000;
  return {
    start: new Date(range.start.getTime() - marginMs),
    end: new Date(range.end.getTime() + marginMs),
  };
}

/**
 * Department calendars a logical event must live in, from its creator +
 * invitees. When nothing derives (e.g. a legacy event with no creator stored)
 * and a fallback calendar is given, that calendar alone is the target set.
 */
async function resolveTargetCalendars(
  input: {
    creatorId: string;
    inviteeUserIds: string[];
    inviteeDepartments: string[];
  },
  fallbackCalendarId: string | null,
): Promise<string[]> {
  const inviteeUserIds = Array.isArray(input.inviteeUserIds) ? input.inviteeUserIds : [];
  const inviteeDepartments = Array.isArray(input.inviteeDepartments)
    ? input.inviteeDepartments
    : [];
  const ids = [...new Set([...(input.creatorId ? [input.creatorId] : []), ...inviteeUserIds])];
  const userDepartments = ids.length > 0 ? await getUserDepartmentIds(ids) : {};
  const derived = deriveTargetCalendarIds({
    creatorDepartmentId: input.creatorId ? (userDepartments[input.creatorId] ?? null) : null,
    invitedUserDepartmentIds: inviteeUserIds.map((id) => userDepartments[id] ?? null),
    invitedDepartmentIds: inviteeDepartments,
  });
  return derived.length > 0 ? derived : (fallbackCalendarId ? [fallbackCalendarId] : []);
}

/** Target set for an existing (representative) copy, from its own people fields. */
async function refTargetCalendars(ref: EventRef): Promise<string[]> {
  return resolveTargetCalendars(
    {
      creatorId: ref.creatorId ?? "",
      inviteeUserIds: ref.inviteeUserIds,
      inviteeDepartments: ref.inviteeDepartmentIds,
    },
    ref.calendarId,
  );
}

/** Resolve-once display data behind the event title template tokens. */
interface EventTitleContext {
  template: string;
  people: EventTitlePerson[];
  departments: string[];
}

/**
 * Resolve the invited people (plain name, acronym, fully qualified name via
 * the display-name template) and department names a title template can
 * render. Unknown ids are dropped; malformed invitee arrays are coerced.
 */
async function buildEventTitleContext(input: EventFormValues): Promise<EventTitleContext> {
  const settings = await getSettings();
  const inviteeUserIds = [
    ...new Set(Array.isArray(input.inviteeUserIds) ? input.inviteeUserIds : []),
  ];
  const inviteeDepartments = Array.isArray(input.inviteeDepartments)
    ? input.inviteeDepartments
    : [];
  const [userRows, departmentNames] = await Promise.all([
    getUsersByIds(inviteeUserIds),
    calendarNames(inviteeDepartments),
  ]);
  const userById = new Map(userRows.map((user) => [user.id, user]));
  const people = inviteeUserIds.flatMap((id) => {
    const user = userById.get(id);
    if (!user) {
      return [];
    }
    return [
      {
        full: user.name,
        acronym: user.shortname || user.name,
        fqn: formatFullName(
          { name: user.name, departmentName: user.departmentName },
          settings.nameTemplate,
        ),
      },
    ];
  });
  return {
    template: settings.eventTitleTemplate,
    people,
    departments: inviteeDepartments.map((id) => departmentNames[id] ?? ""),
  };
}

function buildGcalEventInput(
  googleCalendarId: string,
  input: EventFormValues,
  eventId: string,
  titleContext: EventTitleContext,
): GcalEventInput {
  const rawTitle = input.title.trim();
  const renderedTitle = formatEventTitle(
    {
      description: rawTitle,
      eventType: input.eventType || null,
      people: titleContext.people,
      departments: titleContext.departments,
    },
    titleContext.template,
  );
  // A template that renders to nothing must not produce an untitled event.
  const title = renderedTitle || rawTitle;
  const description = encodeEventNotes({
    eventId,
    eventType: input.eventType || undefined,
    createdBy: input.creatorId || undefined,
    inviteeUsers: input.inviteeUserIds,
    inviteeDepartments: input.inviteeDepartments,
    title: rawTitle,
  });

  const { start, end } = absEventRange(input.start, input.end, input.allDay);
  return {
    calendarId: googleCalendarId,
    title,
    description,
    allDay: input.allDay,
    start,
    end,
  };
}

/**
 * Copies (in one target calendar) of the logical event: items whose notes
 * carry the group id, plus — on a legacy first edit/delete — the original copy
 * matched by Google event id (it has no group id yet).
 */
async function findCopies(
  googleCalendarId: string,
  eventId: string,
  range: AbsRange,
  legacyFallback: { googleCalendarId: string; googleEventId: string } | null,
): Promise<{ googleCalendarId: string; googleEventId: string }[]> {
  const integration = await getGoogleIntegration();
  const items = await integration.listEvents(googleCalendarId, range.start, range.end);
  return items
    .filter((item) => {
      if (parseEventPeople(item.description).eventId === eventId) {
        return true;
      }
      return (
        legacyFallback !== null &&
        googleCalendarId === legacyFallback.googleCalendarId &&
        item.id === legacyFallback.googleEventId
      );
    })
    .map((item) => ({ googleCalendarId, googleEventId: item.id }));
}

/** Google calendar id of the representative copy's registry row, or null. */
async function legacyFallback(ref: EventRef): Promise<{
  googleCalendarId: string;
  googleEventId: string;
} | null> {
  if (ref.eventId !== null) {
    return null;
  }
  const googleCalendarId = await resolveGoogleCalendarId(ref.calendarId);
  return googleCalendarId
    ? { googleCalendarId, googleEventId: ref.googleEventId }
    : null;
}

async function calendarNames(calendarIds: string[]): Promise<Record<string, string>> {
  if (calendarIds.length === 0) {
    return {};
  }
  const rows = await db
    .select({ id: calendars.id, name: calendars.name })
    .from(calendars)
    .where(inArray(calendars.id, calendarIds));
  return Object.fromEntries(rows.map((row) => [row.id, row.name]));
}

export async function createEvent(input: EventFormValues): Promise<EventActionResult> {
  const session = await requireSession();

  const errors = validateEventForm(input);
  if (Object.keys(errors).length > 0) {
    return { ok: false, error: "Check the highlighted fields", field: "title" };
  }

  if (!googleCalendarConfigured()) {
    return { ok: false, error: "Google Calendar is not configured" };
  }

  const targets = await resolveTargetCalendars(input, null);
  if (targets.length === 0) {
    return {
      ok: false,
      error: "Assign yourself to a department or tag an invitee",
    };
  }

  const eventId = crypto.randomUUID();
  const integration = await getGoogleIntegration();
  const titleContext = await buildEventTitleContext(input);
  const created: { googleCalendarId: string; googleEventId: string }[] = [];

  try {
    for (const target of targets) {
      const googleCalendarId = await resolveGoogleCalendarId(target);
      if (!googleCalendarId) {
        throw new Error("Calendar not found");
      }
      const event = await integration.createEvent(
        buildGcalEventInput(googleCalendarId, input, eventId, titleContext),
      );
      created.push({ googleCalendarId, googleEventId: event.id });
    }
  } catch (error) {
    // Roll back partial copies so a failed multi-department create never leaves
    // orphan events behind.
    for (const copy of created) {
      await integration.deleteEvent(copy.googleCalendarId, copy.googleEventId).catch(() => {});
    }
    return { ok: false, error: errorMessage(error) };
  }

  const targetCalendars = await calendarNames(targets);
  await logAction({
    ...actorFrom(session),
    action: AUDIT_ACTIONS.eventCreate,
    entityType: "calendar",
    entityId: targets[0],
    entityName: input.title.trim(),
    method: "createEvent",
    details: {
      eventId,
      eventType: input.eventType || null,
      targetCalendarIds: targets,
      targetCalendars: Object.values(targetCalendars),
      inviteeUserCount: arrayLength(input.inviteeUserIds),
      inviteeDepartmentCount: arrayLength(input.inviteeDepartments),
      googleEventIds: created.map((copy) => copy.googleEventId),
    },
  });

  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Update every linked copy of a logical event. The target set is reconciled:
 * copies in newly-involved departments are created, existing ones updated
 * (backfilling the group id on the first edit of a legacy event), and copies in
 * departments no longer involved are deleted. The plan is idempotent, so a
 * half-failed attempt self-heals on retry.
 */
export async function updateEvent(ref: EventRef, input: EventFormValues): Promise<EventActionResult> {
  const session = await requireSession();

  const errors = validateEventForm(input);
  if (Object.keys(errors).length > 0) {
    return { ok: false, error: "Check the highlighted fields", field: "title" };
  }

  if (!googleCalendarConfigured()) {
    return { ok: false, error: "Google Calendar is not configured" };
  }

  const eventId = ref.eventId ?? crypto.randomUUID();
  const [oldTargets, newTargets] = await Promise.all([
    refTargetCalendars(ref),
    resolveTargetCalendars(input, ref.calendarId),
  ]);

  const integration = await getGoogleIntegration();
  const titleContext = await buildEventTitleContext(input);
  // The old copies' search range covers both the old and new times (±day), so
  // a date/time change still finds the copies to update or retire.
  const range = withMargin(
    unionRange(
      absEventRange(ref.start, ref.end, ref.allDay),
      absEventRange(input.start, input.end, input.allDay),
    ),
  );
  const fallback = await legacyFallback(ref);

  const union = [...new Set([...oldTargets, ...newTargets])];
  const newSet = new Set(newTargets);
  const createdHere: { googleCalendarId: string; googleEventId: string }[] = [];

  try {
    for (const target of union) {
      const googleCalendarId = await resolveGoogleCalendarId(target);
      if (!googleCalendarId) {
        continue;
      }
      const found = await findCopies(googleCalendarId, eventId, range, fallback);
      if (newSet.has(target)) {
        if (found.length > 0) {
          for (const copy of found) {
            await integration.updateEvent(
              copy.googleEventId,
              buildGcalEventInput(googleCalendarId, input, eventId, titleContext),
            );
          }
        } else {
          const event = await integration.createEvent(
            buildGcalEventInput(googleCalendarId, input, eventId, titleContext),
          );
          createdHere.push({ googleCalendarId, googleEventId: event.id });
        }
      } else {
        for (const copy of found) {
          await integration.deleteEvent(googleCalendarId, copy.googleEventId);
        }
      }
    }
  } catch (error) {
    // Newly created copies are rolled back; pre-existing copies were already
    // updated before this point and the retry will re-derive the same plan.
    for (const copy of createdHere) {
      await integration.deleteEvent(copy.googleCalendarId, copy.googleEventId).catch(() => {});
    }
    return { ok: false, error: errorMessage(error) };
  }

  await logAction({
    ...actorFrom(session),
    action: AUDIT_ACTIONS.eventUpdate,
    entityType: "calendar",
    entityId: newTargets[0],
    entityName: input.title.trim(),
    method: "updateEvent",
    details: {
      eventId,
      eventType: input.eventType || null,
      removedCalendarIds: oldTargets.filter((id) => !newSet.has(id)),
      addedCalendarIds: newTargets.filter((id) => !oldTargets.includes(id)),
      inviteeUserCount: arrayLength(input.inviteeUserIds),
      inviteeDepartmentCount: arrayLength(input.inviteeDepartments),
    },
  });

  revalidatePath("/dashboard");
  return { ok: true };
}

/** Delete every linked copy of a logical event. */
export async function deleteEvent(ref: EventRef): Promise<EventActionResult> {
  const session = await requireSession();

  if (!googleCalendarConfigured()) {
    return { ok: false, error: "Google Calendar is not configured" };
  }

  const [targets, fallback] = await Promise.all([refTargetCalendars(ref), legacyFallback(ref)]);
  const integration = await getGoogleIntegration();
  const range = withMargin(absEventRange(ref.start, ref.end, ref.allDay));
  const deletedGoogleEventIds: string[] = [];

  try {
    for (const target of targets) {
      const googleCalendarId = await resolveGoogleCalendarId(target);
      if (!googleCalendarId) {
        continue;
      }
      const found = await findCopies(googleCalendarId, ref.eventId ?? "", range, fallback);
      for (const copy of found) {
        await integration.deleteEvent(googleCalendarId, copy.googleEventId);
        deletedGoogleEventIds.push(copy.googleEventId);
      }
    }
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }

  await logAction({
    ...actorFrom(session),
    action: AUDIT_ACTIONS.eventDelete,
    entityType: "calendar",
    entityId: ref.calendarId,
    entityName: ref.googleEventId,
    method: "deleteEvent",
    details: {
      eventId: ref.eventId,
      targetCalendarIds: targets,
      googleEventIds: deletedGoogleEventIds,
    },
  });

  revalidatePath("/dashboard");
  return { ok: true };
}
