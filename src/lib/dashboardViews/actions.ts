"use server";

import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { userDashboardViews, type UserDashboardView } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { isUuid } from "@/lib/uuid";
import { normalizeStringArray } from "@/lib/validation/arrays";
import { appendDashboardView } from "./mutate";
import { toDashboardViewTab } from "./queries";
import {
  isDashboardViewKind,
  nameAfterKindChange,
  normalizeTextFilter,
  sanitizeDashboardViewName,
  type DashboardTabFilters,
  type DashboardViewKind,
  type DashboardViewTab,
} from "./views";

export type DashboardViewActionResult =
  | { ok: true; id?: string; tab?: DashboardViewTab }
  | { ok: false; error: string; field?: "name" | "kind" };

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
  const created = await appendDashboardView(userId, {
    kind: input.viewType as DashboardViewKind,
    name: name.value,
  });
  if (!created.ok) {
    return { ok: false, error: created.error };
  }
  // The caller navigates to the new id with `force`, which triggers the
  // client-owned `/api/dashboard/load` re-read. No RSC revalidation: the route
  // is a thin shell that reads no view data (see tasks/responsiveness-plan.md).
  return { ok: true, id: created.id, tab: created.tab };
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
  if (!isUuid(id)) {
    return { ok: false, error: "View not found" };
  }
  const name = sanitizeDashboardViewName(input.name);
  if (!name.ok) {
    return { ok: false, error: name.error, field: "name" };
  }
  // Ownership and write in one statement (was SELECT + UPDATE). The manage
  // dialog then calls the dashboard's own `revalidate()`; no RSC revalidation.
  const [updated] = await db
    .update(userDashboardViews)
    .set({ name: name.value, updatedAt: new Date() })
    .where(and(eq(userDashboardViews.id, id), eq(userDashboardViews.userId, userId)))
    .returning();
  if (!updated) {
    return { ok: false, error: "View not found" };
  }
  return { ok: true, tab: toDashboardViewTab(updated) };
}

/**
 * Change the renderer kind of a tab (e.g. turn a "Month" tab into a "Week
 * (D)" tab). The tab keeps its id, strip order, stored filters and its custom
 * name; a name that is still the old kind's default label follows to the new
 * kind's default (the mirror of the Add-view dialog's rule â€” see
 * `nameAfterKindChange`). The active tab's caller re-navigates to the same id
 * so the dashboard re-renders under the new kind with the usual tab-switch
 * period rules.
 */
export async function changeDashboardViewKind(
  id: string,
  input: { kind?: unknown },
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
  if (!isDashboardViewKind(input.kind)) {
    return { ok: false, error: "Pick a view type", field: "kind" };
  }
  const kind = input.kind as DashboardViewKind;
  const oldKind = isDashboardViewKind(owned.view.viewType)
    ? owned.view.viewType
    : "month";
  const name = nameAfterKindChange(owned.view.name, oldKind, kind);
  await db
    .update(userDashboardViews)
    .set({ viewType: kind, name, updatedAt: new Date() })
    .where(eq(userDashboardViews.id, id));
  // No RSC revalidation: the caller re-reads the dashboard data (and switches
  // the active tab with `force`); the route shell reads no view data.
  return { ok: true, tab: { ...toDashboardViewTab(owned.view), kind, name } };
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
  if (!isUuid(id)) {
    return { ok: false, error: "View not found" };
  }
  const clean = (raw: unknown): string[] | null => normalizeStringArray(raw);
  // One statement for ownership + write: this runs inside the filter dialog's
  // Apply spinner, and the old owned-view SELECT followed by the UPDATE paid two
  // Neon round trips for one write. A missing/foreign row returns nothing.
  const [updated] = await db
    .update(userDashboardViews)
    .set({
      calFilter: clean(filters.cal),
      usersFilter: clean(filters.users),
      typesFilter: clean(filters.types),
      textFilter: normalizeTextFilter(filters.text),
      updatedAt: new Date(),
    })
    .where(and(eq(userDashboardViews.id, id), eq(userDashboardViews.userId, userId)))
    .returning({ id: userDashboardViews.id });
  if (!updated) {
    return { ok: false, error: "View not found" };
  }
  // Deliberately no `revalidatePath("/dashboard")`: the dashboard route is a
  // thin client shell that reads no view data (the strip and the filtered
  // events come from `/api/dashboard/load`, which the client re-reads right
  // after this action). Forcing an RSC re-render of the route here only added a
  // full layout+page render to the dialog's Apply wait (~66 ms server-side
  // measured, plus the round trip); see tasks/responsiveness-plan.md.
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
  if (!isUuid(id)) {
    return { ok: false, error: "View not found" };
  }
  // One statement: the ownership probe, the "keep at least one view" guard and
  // the delete. The old path paid an owned-view SELECT, a COUNT and the DELETE
  // (~3 round trips) before the caller's own data re-read.
  const result = await db.execute(sql`
    WITH target AS (
      SELECT id FROM user_dashboard_views
      WHERE id = ${id}::uuid AND user_id = ${userId}::uuid
    ), total AS (
      SELECT count(*)::int AS n FROM user_dashboard_views
      WHERE user_id = ${userId}::uuid
    ), removed AS (
      DELETE FROM user_dashboard_views
      WHERE id IN (SELECT id FROM target)
        AND (SELECT n FROM total) > 1
      RETURNING id
    )
    SELECT
      (SELECT count(*)::int FROM target) AS owned,
      (SELECT count(*)::int FROM removed) AS removed
  `);
  const row = (result as unknown as { owned: number; removed: number }[])[0];
  if (!row || Number(row.owned) === 0) {
    return { ok: false, error: "View not found" };
  }
  if (Number(row.removed) === 0) {
    return { ok: false, error: "A dashboard needs at least one view" };
  }
  // No RSC revalidation: the caller navigates to the remaining tab with
  // `force` (or calls the dashboard's `revalidate()`), which re-reads the data.
  return { ok: true };
}

/**
 * Apply a new strip order. `orderedIds` must be exactly the user's tab ids in
 * the desired order; every row is renumbered to its index in one batched
 * `UPDATE … FROM (VALUES …)` so `sortOrder` stays dense even after legacy gaps.
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
    return { ok: false, error: "The view list changed â€” try again" };
  }
  if (orderedIds.length === 0) {
    return { ok: true };
  }
  // One statement renumbers the whole strip (was one UPDATE per row inside a
  // transaction — N+2 round trips for a long tab strip). The index on
  // (user_id, sort_order) is not unique, so a mid-statement swap is safe.
  const values = sql.join(
    orderedIds.map((viewId, index) => sql`(${viewId}::uuid, ${index}::int)`),
    sql`, `,
  );
  await db.execute(sql`
    UPDATE user_dashboard_views AS v
    SET sort_order = data.sort_order, updated_at = now()
    FROM (VALUES ${values}) AS data(id, sort_order)
    WHERE v.id = data.id AND v.user_id = ${userId}::uuid
  `);
  // No RSC revalidation: the reorder is optimistic in the strip and the caller
  // re-reads the dashboard data afterwards.
  return { ok: true };
}

