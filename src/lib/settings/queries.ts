import { db } from "@/db";
import { settings } from "@/db/schema";

export interface SettingsView {
  userKeyword: string;
}

/**
 * Read-only view of the settings row. Never exposes the admin password hash,
 * which lives on the same row.
 */
export async function getSettings(): Promise<SettingsView> {
  const [row] = await db.select().from(settings).limit(1);
  return { userKeyword: row?.userKeyword ?? "" };
}
