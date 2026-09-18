import { asc, count, eq } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { userDashboardViews, userPreferences, type UserDashboardView } from "@/db/schema";
import { isUuid } from "@/lib/uuid";
import {
  DASHBOARD_VIEW_KIND_LABELS,
  isDashboardViewKind,
  normalizeFilterOverride,
  type DashboardViewTab,
} from "./views";

/**
 * A dashboard render needs at least one tab to exist. This transactional seed
 * creates the user's first tab (a single "Month" view with role-default
 * filters) the first time their views are read, keyed on the
 * `user_preferences` row as a lock anchor so two racing requests (cold start +
 * an early navigation) cannot double-insert.
 */
export async function ensureDefaultDashboardView(userId: string): Promise<void> {
  if (!isUuid(userId)) {
    return;
  }
  await db.transaction(async (tx) => {
    // Upsert the preferences row so it can act as the serialization point.
    await tx
      .insert(userPreferences)
      .values({ userId })
      .onConflictDoNothing({ target: userPreferences.userId });
    await tx
      .select({ userId: userPreferences.userId })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .for("update");
    const [{ n }] = await tx
      .select({ n: count() })
      .from(userDashboardViews)
      .where(eq(userDashboardViews.userId, userId));
    if (n > 0) {
      return;
    }
    await tx.insert(userDashboardViews).values({
      userId,
      viewType: "month",
      name: DASHBOARD_VIEW_KIND_LABELS.month,
      sortOrder: 0,
    });
  });
}

/** Map a raw row onto the view DTO (filters parsed, garbage dropped). */
export function toDashboardViewTab(row: UserDashboardView): DashboardViewTab {
  const kind = isDashboardViewKind(row.viewType) ? row.viewType : "month";
  return {
    id: row.id,
    kind,
    name: row.name,
    sortOrder: row.sortOrder,
    filters: {
      cal: normalizeFilterOverride(row.calFilter),
      users: normalizeFilterOverride(row.usersFilter),
      types: normalizeFilterOverride(row.typesFilter),
    },
  };
}

/**
 * The user's dashboard tabs in strip order, seeding the single default
 * "Month" tab on first read. Cached per request (React `cache`); returns an
 * empty list for the virtual break-glass admin (id `"admin"`, no `users`
 * row) — those sessions render a static default instead.
 */
export const getDashboardViews = cache(async (userId: string): Promise<DashboardViewTab[]> => {
  if (!isUuid(userId)) {
    return [];
  }
  const read = () =>
    db
      .select()
      .from(userDashboardViews)
      .where(eq(userDashboardViews.userId, userId))
      .orderBy(asc(userDashboardViews.sortOrder), asc(userDashboardViews.createdAt));
  // Read first: the transactional seed mutex below is only needed when the
  // user has no tabs yet. The common path (views already exist) skips the
  // INSERT/SELECT-FOR-UPDATE/COUNT transaction entirely, so a dashboard render
  // (which reads views twice per launch — the load and the preload) no longer
  // pays for a write transaction on every read.
  let rows = await read();
  if (rows.length === 0) {
    await ensureDefaultDashboardView(userId);
    rows = await read();
  }
  return rows.map(toDashboardViewTab);
});
