"use server";

import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { EVENT_TYPE_GROUP_ORDER } from "@/lib/db/order";
import { uniqueViolationResult } from "@/db/pgErrors";
import { eventTypes, eventTypeGroups } from "@/db/schema";
import { commitAdminWrite } from "@/lib/actions/adminWrite";
import { applyWriteEffects } from "@/lib/actions/effects";
import type { ActionResult } from "@/lib/actions/result";
import { AUDIT_ACTIONS, actorFromSession } from "@/lib/audit/build";
import { diffFields } from "@/lib/audit/diff";
import { logAction } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/session";
import { moveEventTypeGroupOrder } from "@/lib/eventTypes/groups";

export type EventTypeGroupActionResult = ActionResult<Record<never, never>, "name">;

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
      ...actorFromSession(session),
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
    const mapped = uniqueViolationResult(
      error,
      {},
      { error: "An event type group with this name already exists", field: "name" },
    );
    if (mapped) {
      return mapped;
    }
    throw error;
  }

  applyWriteEffects("eventTypeGroups");
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
      ...actorFromSession(session),
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
    const mapped = uniqueViolationResult(
      error,
      {},
      { error: "An event type group with this name already exists", field: "name" },
    );
    if (mapped) {
      return mapped;
    }
    throw error;
  }

  applyWriteEffects("eventTypeGroups");
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

  await commitAdminWrite({
    session,
    action: AUDIT_ACTIONS.eventTypeGroupUpdate,
    entityType: "eventTypeGroup",
    entityId: id,
    entityName: existing.name,
    method: "setEventTypeGroupCollapsible",
    details: diffFields({ collapsible: existing.collapsible }, { collapsible }),
    effect: "eventTypeGroups",
  });
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

  await commitAdminWrite({
    session,
    action: AUDIT_ACTIONS.eventTypeGroupDelete,
    entityType: "eventTypeGroup",
    entityId: id,
    entityName: existing.name,
    method: "deleteEventTypeGroup",
    details: { ungroupedTypeCount: countRow.count },
    effect: "eventTypeGroups",
    extraEffect: { cache: ["eventTypes"] },
  });
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
    .orderBy(...EVENT_TYPE_GROUP_ORDER);
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

  await commitAdminWrite({
    session,
    action: AUDIT_ACTIONS.eventTypeGroupUpdate,
    entityType: "eventTypeGroup",
    entityId: id,
    entityName: rows[index].name,
    method: "moveEventTypeGroup",
    details: diffFields(
      { order: index + 1, name: rows[index].name },
      { order: neighborIndex + 1, name: rows[index].name },
    ),
    effect: "eventTypeGroups",
  });
  return { ok: true };
}

/**
 * Apply a whole new order (drag). `orderedIds` must be exactly the current
 * group ids in the desired order; every row is renumbered to its index in a
 * transaction. `movedId` is the dragged group, used only for the audit entry.
 */
export async function reorderEventTypeGroups(
  orderedIds: string[],
  movedId?: string,
): Promise<EventTypeGroupActionResult> {
  const session = await requireAdmin();

  const rows = await db
    .select()
    .from(eventTypeGroups)
    .orderBy(...EVENT_TYPE_GROUP_ORDER);
  if (
    rows.length !== orderedIds.length ||
    new Set(orderedIds).size !== orderedIds.length ||
    !orderedIds.every((id) => rows.some((row) => row.id === id))
  ) {
    return { ok: false, error: "The group list changed — try again" };
  }

  const beforeIndex = new Map(rows.map((row, index) => [row.id, index] as const));

  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i += 1) {
      await tx
        .update(eventTypeGroups)
        .set({ sortOrder: i })
        .where(eq(eventTypeGroups.id, orderedIds[i]));
    }
  });

  const moved = movedId ? rows.find((row) => row.id === movedId) : undefined;
  const from = movedId ? beforeIndex.get(movedId) : undefined;
  if (moved && movedId && from !== undefined) {
    await logAction({
      ...actorFromSession(session),
      action: AUDIT_ACTIONS.eventTypeGroupUpdate,
      entityType: "eventTypeGroup",
      entityId: movedId,
      entityName: moved.name,
      method: "reorderEventTypeGroups",
      details: diffFields(
        { order: from + 1, name: moved.name },
        { order: orderedIds.indexOf(movedId) + 1, name: moved.name },
      ),
    });
  }

  applyWriteEffects("eventTypeGroups");
  return { ok: true };
}
