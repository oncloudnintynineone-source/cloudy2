/**
 * Shared server-side tab insertion used by both the normal Create-view flow and
 * Shared-view import. Keeps the default seed, per-user cap and dense strip
 * order in one place. Callers validate the input first and revalidate the
 * dashboard after a successful append.
 */

import { asc, count, eq } from "drizzle-orm";

import { db } from "@/db";
import { userDashboardViews } from "@/db/schema";

import { ensureDefaultDashboardView, toDashboardViewTab } from "./queries";
import {
  MAX_VIEWS_PER_USER,
  type DashboardTabFilters,
  type DashboardViewKind,
  type DashboardViewTab,
} from "./views";

export interface AppendDashboardViewInput {
  kind: DashboardViewKind;
  name: string;
  filters?: DashboardTabFilters;
}

export type AppendDashboardViewResult =
  | { ok: true; id: string; tab: DashboardViewTab }
  | { ok: false; error: string };

/** Append one tab for the user (seeding the first tab when necessary). */
export async function appendDashboardView(
  userId: string,
  input: AppendDashboardViewInput,
): Promise<AppendDashboardViewResult> {
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
  const filters = input.filters ?? { cal: null, users: null, types: null };
  const [created] = await db
    .insert(userDashboardViews)
    .values({
      userId,
      viewType: input.kind,
      name: input.name,
      sortOrder: nextOrder,
      calFilter: filters.cal,
      usersFilter: filters.users,
      typesFilter: filters.types,
    })
    .returning();
  return { ok: true, id: created.id, tab: toDashboardViewTab(created) };
}
