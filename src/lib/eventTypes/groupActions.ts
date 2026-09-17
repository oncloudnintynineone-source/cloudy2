"use server";

import { asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { findUniqueViolation } from "@/db/pgErrors";
import { eventTypes, eventTypeGroups } from "@/db/schema";
import { AUDIT_ACTIONS, actorFromUser } from "@/lib/audit/build";
import { diffFields } from "@/lib/audit/diff";
import { logAction } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/session";
import { moveEventTypeGroupOrder } from "@/lib/eventTypes/groups";

export type EventTypeGroupActionResult =
  | { ok: true }
  | { ok: false; error: string; field?: "name" };

function actorFrom(session: Awaited<ReturnType<typeof requireAdmin>>) {
  return actorFromUser({
    id: session.user.id,
    name: session.user.name ?? null,
    role: session.user.role,
  });
}

export async function createEventTypeGroup(name: string): Promise<EventTypeGroupActionResult> {
  const session = await requireAdmin();

  const trimmed = name.trim();
  if (!trimmed) {
    return { ok: false, error: "Group name is required", field: "name" };
  }

  // New groups append after the last one; a later move re-ranks and closes
  // any gaps (same convention as department sortOrder).
  const rows = await db
    .select({ sortOrder: eventTypeGroups.sortOrder })
    .from(eventTypeGroups)
    .orderBy(asc(eventTypeGroups.sortOrder));
  const sortOrder =
    rows.length > 0 ? rows.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1 : 0;

  try {
    const [created] = await db
      .insert(eventTypeGroups)
      .values({ name: trimmed, sortOrder })
      .returning({ id: eventTypeGroups.id, name: eventTypeGroups.name });

    await logAction({
      ...actorFrom(session),
      action: AUDIT_ACTIONS.eventTypeGroupCreate,
      entityType: "eventTypeGroup",
      entityId: created.id,
      entityName: created.name,
      method: "createEventTypeGroup",
      details: { name: trimmed, order: sortOrder + 1 },
    });
  } catch (error) {
    // Drizzle wraps the PostgresError in a DrizzleQueryError, so the
    // constraint name lives down the .cause chain (see src/db/pgErrors.ts).
    if (findUniqueViolation(error)) {
      return {
        ok: false,
        error: "An event type group with this name already exists",
        field: "name",
      };
    }
    throw error;
  }

  revalidatePath("/settings/event-types");
  return { ok: true };
}

export async function renameEventTypeGroup(
  id: string,
  name: string,
): Promise<EventTypeGroupActionResult> {
  const session = await requireAdmin();

  const trimmed = name.trim();
  if (!trimmed) {
    return { ok: false, error: "Group name is required", field: "name" };
  }

  const [existing] = await db
    .select()
    .from(eventTypeGroups)
    .where(eq(eventTypeGroups.id, id))
    .limit(1);
  if (!existing) {
    return { ok: false, error: "Event type group not found", field: "name" };
  }

  try {
    await db
      .update(eventTypeGroups)
      .set({ name: trimmed, updatedAt: new Date() })
      .where(eq(eventTypeGroups.id, id));

    await logAction({
      ...actorFrom(session),
      action: AUDIT_ACTIONS.eventTypeGroupUpdate,
      entityType: "eventTypeGroup",
      entityId: id,
      entityName: trimmed,
      method: "renameEventTypeGroup",
      details: diffFields({ name: existing.name }, { name: trimmed }),
    });
  } catch (error) {
    // Drizzle wraps the PostgresError in a DrizzleQueryError, so the
    // constraint name lives down the .cause chain (see src/db/pgErrors.ts).
    if (findUniqueViolation(error)) {
      return {
        ok: false,
        error: "An event type group with this name already exists",
        field: "name",
      };
    }
    throw error;
  }

  revalidatePath("/settings/event-types");
  return { ok: true };
}

/**
 * Toggle whether a group renders as a collapsible folder in the event form's
 * type step (true) or as the previous always-expanded labeled section (false).
 */
export async function setEventTypeGroupCollapsible(
  id: string,
  collapsible: boolean,
): Promise<EventTypeGroupActionResult> {
  const session = await requireAdmin();

  const [existing] = await db
    .select()
    .from(eventTypeGroups)
    .where(eq(eventTypeGroups.id, id))
    .limit(1);
  if (!existing) {
    return { ok: false, error: "Event type group not found", field: "name" };
  }
  if (existing.collapsible === collapsible) {
    return { ok: true };
  }

  await db
    .update(eventTypeGroups)
    .set({ collapsible, updatedAt: new Date() })
    .where(eq(eventTypeGroups.id, id));

  await logAction({
    ...actorFrom(session),
    action: AUDIT_ACTIONS.eventTypeGroupUpdate,
    entityType: "eventTypeGroup",
    entityId: id,
    entityName: existing.name,
    method: "setEventTypeGroupCollapsible",
    details: diffFields(
      { collapsible: existing.collapsible },
      { collapsible },
    ),
  });

  revalidatePath("/settings/event-types");
  return { ok: true };
}

export async function deleteEventTypeGroup(id: string): Promise<EventTypeGroupActionResult> {
  const session = await requireAdmin();

  const [existing] = await db
    .select()
    .from(eventTypeGroups)
    .where(eq(eventTypeGroups.id, id))
    .limit(1);
  if (!existing) {
    return { ok: true };
  }

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(eventTypes)
    .where(eq(eventTypes.groupId, id));

  // The FK is ON DELETE SET NULL, so this ungroups the group's types.
  await db.delete(eventTypeGroups).where(eq(eventTypeGroups.id, id));

  await logAction({
    ...actorFrom(session),
    action: AUDIT_ACTIONS.eventTypeGroupDelete,
    entityType: "eventTypeGroup",
    entityId: id,
    entityName: existing.name,
    method: "deleteEventTypeGroup",
    details: { ungroupedTypeCount: countRow.count },
  });

  revalidatePath("/settings/event-types");
  return { ok: true };
}

/**
 * Move a group one step toward the front ("up") or back ("down") in the
 * display order; the result is re-ranked (sortOrder = position), which also
 * closes gaps left by legacy values. No-op at either end of the list.
 */
export async function moveEventTypeGroup(
  id: string,
  direction: "up" | "down",
): Promise<EventTypeGroupActionResult> {
  const session = await requireAdmin();

  const rows = await db
    .select()
    .from(eventTypeGroups)
    .orderBy(asc(eventTypeGroups.sortOrder), asc(eventTypeGroups.name));
  const index = rows.findIndex((row) => row.id === id);
  if (index === -1) {
    return { ok: false, error: "Event type group not found", field: "name" };
  }
  const moved = moveEventTypeGroupOrder(rows, id, direction);
  if (!moved) {
    return { ok: true };
  }
  const neighborIndex = moved.findIndex((row) => row.id === id);

  await db.transaction(async (tx) => {
    for (const entry of moved) {
      const current = rows.find((row) => row.id === entry.id);
      if (current && current.sortOrder !== entry.sortOrder) {
        await tx
          .update(eventTypeGroups)
          .set({ sortOrder: entry.sortOrder })
          .where(eq(eventTypeGroups.id, entry.id));
      }
    }
  });

  await logAction({
    ...actorFrom(session),
    action: AUDIT_ACTIONS.eventTypeGroupUpdate,
    entityType: "eventTypeGroup",
    entityId: id,
    entityName: rows[index].name,
    method: "moveEventTypeGroup",
    details: diffFields(
      { order: index + 1, name: rows[index].name },
      { order: neighborIndex + 1, name: rows[index].name },
    ),
  });

  revalidatePath("/settings/event-types");
  return { ok: true };
}
