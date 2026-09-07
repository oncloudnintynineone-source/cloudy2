"use server";

import { and, asc, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { userDashboardViews, type UserDashboardView } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { isUuid } from "@/lib/uuid";
import { ensureDefaultDashboardView } from "./queries";
import {
  isDashboardViewKind,
  sanitizeDashboardViewName,
  type DashboardTabFilters,
  type DashboardViewKind,
} from "./views";

export type DashboardViewActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string; field?: "name" | "kind" };

/** Soft per-user tab cap — sanity guard, not a hard product limit. */
const MAX_VIEWS_PER_USER = 20;

async function requireOwnedView(
  userId: string,
  id: string,
): Promise<{ view: UserDashboardView; error: null } | { view: null; error: string }> {
  if (!isUuid(id)) {
    return { view: null, error: "View not found" };
  }
  const [view] = await db
    .select()
    .from(userDashboardViews)
    .where(and(eq(userDashboardViews.id, id), eq(userDashboardViews.userId, userId)))
    .limit(1);
  return view ? { view, error: null } : { view: null, error: "View not found" };
}

/**
 * Create a new dashboard tab of the given renderer kind with role-default
 * filters, appended at the end of the strip. The caller navigates to the
 * returned id (`?view=<id>`) which the next render then shows.
 */
export async function createDashboardView(input: {
  viewType?: unknown;
  name?: unknown;
}): Promise<DashboardViewActionResult> {
  const session = await requireSession();
  const userId = session.user.id;
  if (!isUuid(userId)) {
    return { ok: false, error: "Not available for this account" };
  }
  const name = sanitizeDashboardViewName(input.name);
  if (!name.ok) {
    return { ok: false, error: name.error, field: "name" };
  }
  if (!isDashboardViewKind(input.viewType)) {
    return { ok: false, error: "Pick a view type", field: "kind" };
  }
  await ensureDefaultDashboardView(userId);
  const [{ n }] = await db
    .select({ n: count() })
    .from(userDashboardViews)
    .where(eq(userDashboardViews.userId, userId));
  if (n >= MAX_VIEWS_PER_USER) {
    return { ok: false, error: `You've reached the ${MAX_VIEWS_PER_USER}-view limit` };
  }
  const rows = await db
    .select({ sortOrder: userDashboardViews.sortOrder })
    .from(userDashboardViews)
    .where(eq(userDashboardViews.userId, userId))
    .orderBy(asc(userDashboardViews.sortOrder));
  const nextOrder = rows.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
  const [created] = await db
    .insert(userDashboardViews)
    .values({
      userId,
      viewType: input.viewType as DashboardViewKind,
      name: name.value,
      sortOrder: nextOrder,
    })
    .returning({ id: userDashboardViews.id });
  revalidatePath("/dashboard");
  return { ok: true, id: created.id };
}

/** Rename a tab (display name in the strip). */
export async function renameDashboardView(
  id: string,
  input: { name?: unknown },
): Promise<DashboardViewActionResult> {
  const session = await requireSession();
  const userId = session.user.id;
  if (!isUuid(userId)) {
    return { ok: false, error: "Not available for this account" };
  }
  const owned = await requireOwnedView(userId, id);
  if (!owned.view) {
    return { ok: false, error: owned.error };
  }
  const name = sanitizeDashboardViewName(input.name);
  if (!name.ok) {
    return { ok: false, error: name.error, field: "name" };
  }
  await db
    .update(userDashboardViews)
    .set({ name: name.value, updatedAt: new Date() })
    .where(eq(userDashboardViews.id, id));
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Persist a tab's filter overrides. `null` = role default; `[]` = cleared. */
export async function saveDashboardViewFilters(
  id: string,
  filters: Partial<DashboardTabFilters>,
): Promise<DashboardViewActionResult> {
  const session = await requireSession();
  const userId = session.user.id;
  if (!isUuid(userId)) {
    return { ok: false, error: "Not available for this account" };
  }
  const owned = await requireOwnedView(userId, id);
  if (!owned.view) {
    return { ok: false, error: owned.error };
  }
  const clean = (raw: unknown): string[] | null => {
    if (raw === null || raw === undefined) {
      return null;
    }
    if (!Array.isArray(raw)) {
      return null;
    }
    return raw.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
  };
  await db
    .update(userDashboardViews)
    .set({
      calFilter: clean(filters.cal),
      usersFilter: clean(filters.users),
      typesFilter: clean(filters.types),
      updatedAt: new Date(),
    })
    .where(eq(userDashboardViews.id, id));
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Delete a tab. The last remaining tab cannot be deleted (the dashboard needs
 * at least one view). Deleting the active tab leaves the remembered
 * last-active id nulled by the FK, so the next render resolves to the first
 * tab; the caller navigates there when the deleted tab was active.
 */
export async function deleteDashboardView(id: string): Promise<DashboardViewActionResult> {
  const session = await requireSession();
  const userId = session.user.id;
  if (!isUuid(userId)) {
    return { ok: false, error: "Not available for this account" };
  }
  const owned = await requireOwnedView(userId, id);
  if (!owned.view) {
    return { ok: false, error: owned.error };
  }
  const [{ n }] = await db
    .select({ n: count() })
    .from(userDashboardViews)
    .where(eq(userDashboardViews.userId, userId));
  if (n <= 1) {
    return { ok: false, error: "A dashboard needs at least one view" };
  }
  await db.delete(userDashboardViews).where(eq(userDashboardViews.id, id));
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Apply a new strip order. `orderedIds` must be exactly the user's tab ids in
 * the desired order; every row is renumbered to its index in a transaction so
 * `sortOrder` stays dense and unique even after legacy gaps.
 */
export async function reorderDashboardViews(orderedIds: string[]): Promise<DashboardViewActionResult> {
  const session = await requireSession();
  const userId = session.user.id;
  if (!isUuid(userId)) {
    return { ok: false, error: "Not available for this account" };
  }
  const rows = await db
    .select({ id: userDashboardViews.id })
    .from(userDashboardViews)
    .where(eq(userDashboardViews.userId, userId))
    .orderBy(asc(userDashboardViews.sortOrder));
  if (
    rows.length !== orderedIds.length ||
    new Set(rows.map((row) => row.id)).size !== orderedIds.length ||
    !orderedIds.every((id) => rows.some((row) => row.id === id))
  ) {
    return { ok: false, error: "The view list changed — try again" };
  }
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i += 1) {
      await tx
        .update(userDashboardViews)
        .set({ sortOrder: i, updatedAt: new Date() })
        .where(eq(userDashboardViews.id, orderedIds[i]));
    }
  });
  revalidatePath("/dashboard");
  return { ok: true };
}

