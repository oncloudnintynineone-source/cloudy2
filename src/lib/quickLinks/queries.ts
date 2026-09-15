import { asc } from "drizzle-orm";

import { db } from "@/db";
import { quickLinks, type QuickLink } from "@/db/schema";
import { getCachedValue } from "@/lib/cache";
import { CONFIG_CACHE_KEYS, CONFIG_CACHE_TTL_MS } from "@/lib/configCache";

/**
 * All quick links in menu display order. Served from a 60s in-memory TTL
 * (`getCachedValue`) — user-independent and read on every dashboard config
 * pass. Admin edits appear within `CONFIG_CACHE_TTL_MS`.
 */
export async function listQuickLinks(): Promise<QuickLink[]> {
  return getCachedValue(CONFIG_CACHE_KEYS.quickLinks, CONFIG_CACHE_TTL_MS, async () =>
    db
      .select()
      .from(quickLinks)
      .orderBy(asc(quickLinks.sortOrder), asc(quickLinks.createdAt)),
  );
}
