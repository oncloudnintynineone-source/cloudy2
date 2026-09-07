"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { userDashboardViews, userPreferences } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { isUuid } from "@/lib/uuid";
import { ensureDefaultDashboardView } from "@/lib/dashboardViews/queries";

export type UserPrefsActionResult = { ok: true } | { ok: false; error: string };

/** Non-empty strings only; the remembered lists never carry junk ids. */
function cleanStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

/**
 * Remember the user's last-active dashboard tab (server-side, so the tab
 * follows the account across devices; the URL `?view=` still wins for the
 * current render). The tab must be one of the user's own — foreign/deleted
 * ids are a no-op. Fire-and-forget from `switchTab`: a failed write just
 * resumes the previous tab on the next bare load.
 */
export async function setActiveDashboardView(tabId: string): Promise<UserPrefsActionResult> {
  const session = await requireSession();
  const userId = session.user.id;
  if (!isUuid(userId) || !isUuid(tabId)) {
    return { ok: true };
  }
  await ensureDefaultDashboardView(userId);
  const [owned] = await db
    .select({ id: userDashboardViews.id })
    .from(userDashboardViews)
    .where(and(eq(userDashboardViews.id, tabId), eq(userDashboardViews.userId, userId)))
    .limit(1);
  if (!owned) {
    return { ok: true };
  }
  await db
    .insert(userPreferences)
    .values({ userId, dashboardActiveViewId: tabId })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { dashboardActiveViewId: tabId, updatedAt: new Date() },
    });
  return { ok: true };
}

/**
 * Persist the Parade State Calendars/Users filter selection. Empty lists are
 * stored as-is (parade defaults to all calendars / no user filter when the
 * list is empty — there is no role-default distinction for parade). The
 * caller re-renders the page afterwards so the event rows refetch.
 */
export async function saveParadeFilters(input: {
  cal?: unknown;
  users?: unknown;
}): Promise<UserPrefsActionResult> {
  const session = await requireSession();
  const userId = session.user.id;
  if (!isUuid(userId)) {
    return { ok: true };
  }
  const cal = cleanStringList(input.cal);
  const users = cleanStringList(input.users);
  await db
    .insert(userPreferences)
    .values({ userId, paradeCal: cal, paradeUsers: users })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { paradeCal: cal, paradeUsers: users, updatedAt: new Date() },
    });
  revalidatePath("/parade-state");
  return { ok: true };
}
