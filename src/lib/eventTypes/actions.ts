"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { eventTypes, type EventType } from "@/db/schema";
import { AUDIT_ACTIONS, actorFromUser } from "@/lib/audit/build";
import { diffFields } from "@/lib/audit/diff";
import { logAction } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/session";
import { validateEventTypeForm, type EventTypeFormValues } from "@/lib/eventTypes/validate";
import { normalizeTimeOptions } from "@/lib/events/timeOptions";

export type EventTypeActionResult =
  | { ok: true }
  | { ok: false; error: string; field?: "name" | "shortname" | "timeOptions" };

function isUniqueViolation(error: unknown): error is {
  code?: string;
  constraint_name?: string;
} {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

/** Constraint name violated by a unique-violation error, or null. */
function violatedConstraint(error: unknown): string | null {
  return isUniqueViolation(error) ? error.constraint_name ?? null : null;
}

function actorFrom(session: Awaited<ReturnType<typeof requireAdmin>>) {
  return actorFromUser({
    id: session.user.id,
    name: session.user.name ?? null,
    role: session.user.role,
  });
}

async function getEventTypeOrNull(id: string): Promise<EventType | null> {
  const [row] = await db.select().from(eventTypes).where(eq(eventTypes.id, id)).limit(1);
  return row ?? null;
}

export async function createEventType(input: EventTypeFormValues): Promise<EventTypeActionResult> {
  const session = await requireAdmin();

  const errors = validateEventTypeForm(input);
  if (Object.keys(errors).length > 0) {
    return { ok: false, error: "Name is required", field: "name" };
  }

  const name = input.name.trim();
  const shortname = input.shortname.trim();
  const timeOptions = normalizeTimeOptions(input.timeOptions);
  try {
    const [created] = await db
      .insert(eventTypes)
      .values({ name, shortname, timeOptions })
      .returning({ id: eventTypes.id, name: eventTypes.name });

    await logAction({
      ...actorFrom(session),
      action: AUDIT_ACTIONS.eventTypeCreate,
      entityType: "eventType",
      entityId: created.id,
      entityName: created.name,
      method: "createEventType",
      details: { name, shortname, timeOptions },
    });
  } catch (error) {
    if (violatedConstraint(error) === "event_types_shortname_idx") {
      return {
        ok: false,
        error: "An event type with this shortname already exists",
        field: "shortname",
      };
    }
    if (isUniqueViolation(error)) {
      return { ok: false, error: "An event type with this name already exists", field: "name" };
    }
    throw error;
  }

  revalidatePath("/settings/event-types");
  return { ok: true };
}

export async function renameEventType(
  id: string,
  input: EventTypeFormValues,
): Promise<EventTypeActionResult> {
  const session = await requireAdmin();

  const errors = validateEventTypeForm(input);
  if (Object.keys(errors).length > 0) {
    return { ok: false, error: "Name is required", field: "name" };
  }

  const existing = await getEventTypeOrNull(id);
  if (!existing) {
    return { ok: false, error: "Event type not found", field: "name" };
  }

  const name = input.name.trim();
  const shortname = input.shortname.trim();
  const timeOptions = normalizeTimeOptions(input.timeOptions);
  try {
    await db
      .update(eventTypes)
      .set({ name, shortname, timeOptions, updatedAt: new Date() })
      .where(eq(eventTypes.id, id));

    await logAction({
      ...actorFrom(session),
      action: AUDIT_ACTIONS.eventTypeRename,
      entityType: "eventType",
      entityId: id,
      entityName: name,
      method: "renameEventType",
      details: diffFields(
        {
          name: existing.name,
          shortname: existing.shortname,
          timeOptions: existing.timeOptions,
        },
        { name, shortname, timeOptions },
      ),
    });
  } catch (error) {
    if (violatedConstraint(error) === "event_types_shortname_idx") {
      return {
        ok: false,
        error: "An event type with this shortname already exists",
        field: "shortname",
      };
    }
    if (isUniqueViolation(error)) {
      return { ok: false, error: "An event type with this name already exists", field: "name" };
    }
    throw error;
  }

  revalidatePath("/settings/event-types");
  return { ok: true };
}

export async function deleteEventType(id: string): Promise<EventTypeActionResult> {
  const session = await requireAdmin();

  const existing = await getEventTypeOrNull(id);
  if (!existing) {
    return { ok: true };
  }

  await db.delete(eventTypes).where(eq(eventTypes.id, id));

  await logAction({
    ...actorFrom(session),
    action: AUDIT_ACTIONS.eventTypeDelete,
    entityType: "eventType",
    entityId: id,
    entityName: existing.name,
    method: "deleteEventType",
  });

  revalidatePath("/settings/event-types");
  return { ok: true };
}
