"use server";

import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { getUserPreferences } from "@/lib/userPrefs/queries";
import { isUuid } from "@/lib/uuid";
import {
  addSearchHistoryEntry,
  removeSearchHistoryEntry,
} from "./searchHistory";

export type SearchHistoryResult = { ok: true; history: string[] } | { ok: false; error: string };

/**
 * Read the signed-in user's recent event-search queries (most-recent-first).
 * Empty for the virtual break-glass admin (no `users` row, no storage).
 */
export async function getSearchHistory(): Promise<SearchHistoryResult> {
  const session = await requireSession();
  const prefs = await getUserPreferences(session.user.id);
  if (!prefs) {
    return { ok: true, history: [] };
  }
  return { ok: true, history: prefs.searchHistory };
}

/**
 * Persist a newly-searched query into the user's history (trimmed, deduped,
 * capped). Fire-and-forget from the search modal — a failed write just means
 * the shortcut won't appear next time.
 */
export async function recordSearchHistory(query: unknown): Promise<{ ok: boolean }> {
  const session = await requireSession();
  const userId = session.user.id;
  if (!isUuid(userId)) {
    return { ok: true };
  }
  if (typeof query !== "string") {
    return { ok: true };
  }
  const prefs = await getUserPreferences(userId);
  const next = addSearchHistoryEntry(prefs?.searchHistory ?? [], query);
  await db
    .insert(userPreferences)
    .values({ userId, searchHistory: next })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { searchHistory: next, updatedAt: new Date() },
    });
  return { ok: true };
}

/**
 * Remove one query from the user's history (case-insensitively). Called from a
 * badge's clear affordance.
 */
export async function removeSearchHistory(query: unknown): Promise<{ ok: boolean }> {
  const session = await requireSession();
  const userId = session.user.id;
  if (!isUuid(userId)) {
    return { ok: true };
  }
  if (typeof query !== "string") {
    return { ok: true };
  }
  const prefs = await getUserPreferences(userId);
  const next = removeSearchHistoryEntry(prefs?.searchHistory ?? [], query);
  await db
    .insert(userPreferences)
    .values({ userId, searchHistory: next })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { searchHistory: next, updatedAt: new Date() },
    });
  return { ok: true };
}
