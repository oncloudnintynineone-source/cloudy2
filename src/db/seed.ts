/**
 * Dev-only seed: defaults the settings row's user login keyword so users
 * created in-app can sign in as `[phone]<keyword>`. Departments and users are
 * NOT seeded — a department (`calendars`) row must mirror a Google calendar
 * created through the app (`createDepartment` → `integration.createCalendar`),
 * so inserting fabricated calendar ids would break a real service account.
 * Idempotent — safe to re-run.
 *
 * Usage: `pnpm db:seed` (reads DATABASE_URL from the environment or .env.local)
 */

import { hash } from "bcryptjs";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";

import { db } from "./index";
import { settings } from "./schema";

const SETTINGS_ID = "singleton";

function loadEnvFile(): void {
  if (process.env.DATABASE_URL) {
    return;
  }
  const envPath = join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    console.error("DATABASE_URL is not set and no .env.local was found.");
    process.exit(1);
  }
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }
    const [, key, value] = match;
    if (!(key in process.env)) {
      process.env[key] = value.trim().replace(/^["']|["']$/g, "");
    }
  }
}

async function seed() {
  loadEnvFile();

  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to seed in production.");
    process.exit(1);
  }

  const [row] = await db.select().from(settings).where(eq(settings.id, SETTINGS_ID)).limit(1);

  if (!row) {
    // Mirror `ensureSettingsRow` (src/lib/bootstrap.ts): the singleton row is
    // normally created on first auth with the admin password hash. Inserting
    // it here (with the hashes when ADMIN_INITIAL_PASSWORD / ADMIN_PIN are
    // set) keeps admin login working on a fresh, never-authenticated database.
    const initialPassword = process.env.ADMIN_INITIAL_PASSWORD;
    const adminPasswordHash = initialPassword ? await hash(initialPassword, 10) : null;
    const adminPin = process.env.ADMIN_PIN;
    const adminPinHash = adminPin ? await hash(adminPin, 10) : null;
    await db
      .insert(settings)
      .values({ id: SETTINGS_ID, userKeyword: "leave", adminPasswordHash, adminPinHash })
      .onConflictDoNothing();
    console.log(
      "Created settings row with userKeyword = 'leave' so users can log in as [phone]leave",
    );
  } else if (!row.userKeyword) {
    await db
      .update(settings)
      .set({ userKeyword: "leave", updatedAt: new Date() })
      .where(eq(settings.id, row.id));
    console.log("Set settings.userKeyword = 'leave' so users can log in as [phone]leave");
  } else {
    console.log("Settings already has a user keyword; nothing to seed.");
  }

  console.log("Seeded settings defaults (no departments/users — create them in-app).");
  console.log("Re-run anytime; existing rows are skipped.");
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
