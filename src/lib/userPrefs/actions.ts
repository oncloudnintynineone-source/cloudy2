"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { normalizeWeekStart, type WeekStart } from "@/lib/events/datetime";
import { requireSession } from "@/lib/session";
import { isUuid } from "@/lib/uuid";

import { getUserPreferences } from "./queries";

export type UserPrefsActionResult = { ok: true } | { ok: false; error: string };

/** Non-empty strings only; the remembered lists never carry junk ids. */
function cleanStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
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

/**
 * Read the current account's week-start preference. Falls back to Monday for
 * the break-glass admin (which has no `user_preferences` row).
 */
export async function getWeekStart(): Promise<WeekStart> {
  const session = await requireSession();
  const prefs = await getUserPreferences(session.user.id);
  return prefs?.weekStart ?? "monday";
}

/**
 * Persist the week-start preference for the account. The client reloads the
 * page afterwards so every week/month grid re-reads with the new first day.
 */
export async function setWeekStart(value: unknown): Promise<UserPrefsActionResult> {
  const session = await requireSession();
  const userId = session.user.id;
  if (!isUuid(userId)) {
    return { ok: true };
  }
  const weekStart = normalizeWeekStart(value);
  await db
    .insert(userPreferences)
    .values({ userId, weekStart })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { weekStart, updatedAt: new Date() },
    });
  revalidatePath("/dashboard");
  return { ok: true };
}
