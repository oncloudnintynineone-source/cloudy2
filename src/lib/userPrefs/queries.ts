import { eq } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { userPreferences, type UserPreference } from "@/db/schema";
import { isUuid } from "@/lib/uuid";

/**
 * Per-user application preferences stored server-side so they follow the
 * account across devices (see docs/ui-state.md): the remembered (last-active)
 * dashboard tab and the Parade State Calendars/Users filters. The row is
 * lazily ensured on first read. Device-local preferences — sidebar rail
 * state, Day/Week (H) zoom, the dashboard date/month anchor and the last
 * visited page — deliberately stay in the `cloudy2.ui` cookie.
 */
export interface UserPreferencesView {
  userId: string;
  /** The user's last-active dashboard tab id, or null (= first tab in order). */
  dashboardActiveViewId: string | null;
  /** Parade State Calendars filter — an explicit list (empty = all). */
  paradeCal: string[];
  /** Parade State Users filter — an explicit list (empty = no user filter). */
  paradeUsers: string[];
}

/** Non-empty strings only; garbage entries drop out of a remembered list. */
function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

async function readRow(userId: string): Promise<UserPreference | null> {
  const [row] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  return row ?? null;
}

/**
 * Read a user's preferences, ensuring the row on first access. Cached per
 * request (React `cache`). Returns null for the virtual break-glass admin
 * (`id === "admin"`, no `users` row) — those sessions have no storage.
 */
export const getUserPreferences = cache(
  async (userId: string): Promise<UserPreferencesView | null> => {
    if (!isUuid(userId)) {
      return null;
    }
    let row = await readRow(userId);
    if (!row) {
      await db
        .insert(userPreferences)
        .values({ userId })
        .onConflictDoNothing({ target: userPreferences.userId });
      row = await readRow(userId);
    }
    if (!row) {
      return null;
    }
    return {
      userId: row.userId,
      dashboardActiveViewId: row.dashboardActiveViewId,
      paradeCal: toStringList(row.paradeCal),
      paradeUsers: toStringList(row.paradeUsers),
    };
  },
);
