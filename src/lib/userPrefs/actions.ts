"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { isUuid } from "@/lib/uuid";

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
