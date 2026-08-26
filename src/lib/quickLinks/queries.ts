import { asc } from "drizzle-orm";

import { db } from "@/db";
import { quickLinks, type QuickLink } from "@/db/schema";

/** All quick links in menu display order. */
export async function listQuickLinks(): Promise<QuickLink[]> {
  return db
    .select()
    .from(quickLinks)
    .orderBy(asc(quickLinks.sortOrder), asc(quickLinks.createdAt));
}
