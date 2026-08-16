import { hash } from "bcryptjs";

import { db } from "@/db";
import { settings } from "@/db/schema";

const SETTINGS_ID = "singleton";

/**
 * Ensures the single settings row exists, seeding the initial admin password
 * hash from `ADMIN_INITIAL_PASSWORD` on first run. Idempotent and race-safe:
 * `onConflictDoNothing` keeps whichever insert wins, and the
 * `settings_singleton` check constraint prevents a second row entirely.
 */
export async function ensureSettingsRow(): Promise<void> {
  const [existing] = await db.select().from(settings).limit(1);
  if (existing) {
    return;
  }

  const initialPassword = process.env.ADMIN_INITIAL_PASSWORD;
  const adminPasswordHash = initialPassword ? await hash(initialPassword, 10) : null;

  await db.insert(settings).values({ id: SETTINGS_ID, adminPasswordHash }).onConflictDoNothing();
}
