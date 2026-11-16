/**
 * Shared server-side tab insertion used by both the normal Create-view flow and
 * Shared-view import. Keeps the per-user cap and dense strip order in one place.
 * Callers validate the input first; the dashboard data is re-read by the client
 * after a successful append.
 */

import { count, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { userDashboardViews } from "@/db/schema";

import { toDashboardViewTab } from "./queries";
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

/**
 * Append one tab for the user at the end of their strip.
 *
 * Two round trips: the cap probe, then one INSERT whose `sortOrder` is computed
 * in SQL from the current max. The old path also ran `ensureDefaultDashboardView`
 * (a lock/upsert/count transaction) and a separate sort-order SELECT on every
 * append — three extra round trips on the Add-view path. That transaction also
 * serialized concurrent appends per user; without it, two simultaneous appends
 * can compute the same max (a duplicate `sortOrder`). The strip still orders ties
 * by `createdAt`, and the next reorder normalizes the numbering, so this is an
 * accepted trade for the hot path; the client also guards its Add-view button.
 * The default-tab seed is not needed here: the insert itself creates the first
 * tab, and `getDashboardViews` is the only owner of the zero-tab seed.
 */
export async function appendDashboardView(
  userId: string,
  input: AppendDashboardViewInput,
): Promise<AppendDashboardViewResult> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(userDashboardViews)
    .where(eq(userDashboardViews.userId, userId));
  if (n >= MAX_VIEWS_PER_USER) {
    return { ok: false, error: `You've reached the ${MAX_VIEWS_PER_USER}-view limit` };
  }
  const filters = input.filters ?? { cal: null, users: null, types: null, text: null };
  const [created] = await db
    .insert(userDashboardViews)
    .values({
      userId,
      viewType: input.kind,
      name: input.name,
      // Dense append: one past the current maximum, computed atomically with the
      // insert (0 for the account's first tab).
      sortOrder: sql<number>`COALESCE((SELECT MAX(${userDashboardViews.sortOrder}) + 1
        FROM ${userDashboardViews}
        WHERE ${userDashboardViews.userId} = ${userId}), 0)`,
      calFilter: filters.cal,
      usersFilter: filters.users,
      typesFilter: filters.types,
      textFilter: filters.text,
    })
    .returning();
  return { ok: true, id: created.id, tab: toDashboardViewTab(created) };
}
