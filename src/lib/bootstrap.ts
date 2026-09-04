import { compare, hash } from "bcryptjs";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { settings } from "@/db/schema";

const SETTINGS_ID = "singleton";

/**
 * The two env-seeded secrets held on the settings row, each reconciled from
 * its own env var (so they rotate independently). Both are only ever set by
 * the deployment environment — there is no in-app management path.
 */
const ADMIN_SECRET_ENV_VARS = [
  { env: "ADMIN_INITIAL_PASSWORD", column: "adminPasswordHash" },
  { env: "ADMIN_PIN", column: "adminPinHash" },
] as const;

async function readSettingsRow() {
  const [row] = await db.select().from(settings).limit(1);
  return row ?? null;
}

/**
 * Ensures the single settings row exists, seeding both admin secrets from
 * their env vars on first run. Idempotent and race-safe:
 * `onConflictDoNothing` keeps whichever insert wins, and the
 * `settings_singleton` check constraint prevents a second row entirely.
 */
export async function ensureSettingsRow(): Promise<void> {
  const existing = await readSettingsRow();
  if (existing) {
    return;
  }

  const adminPasswordHash = process.env.ADMIN_INITIAL_PASSWORD
    ? await hash(process.env.ADMIN_INITIAL_PASSWORD, 10)
    : null;
  const adminPinHash = process.env.ADMIN_PIN ? await hash(process.env.ADMIN_PIN, 10) : null;

  await db
    .insert(settings)
    .values({ id: SETTINGS_ID, adminPasswordHash, adminPinHash })
    .onConflictDoNothing();
}

/**
 * Makes the environment authoritative for the admin secrets: when an env var
 * is set and the stored hash does not match it, re-hash and store it. A var
 * that is unset leaves the stored hash untouched (the last value persists),
 * so removing a secret does not lock anyone out mid-flight.
 */
export async function syncAdminSecretsFromEnv(): Promise<void> {
  const row = await readSettingsRow();
  if (!row) {
    return;
  }

  for (const { env, column } of ADMIN_SECRET_ENV_VARS) {
    const value = process.env[env];
    if (!value) {
      continue;
    }
    const storedHash = row[column] ?? null;
    // Match without a re-hash on the steady state; hash only when changed.
    if (storedHash && (await compare(value, storedHash))) {
      continue;
    }
    const nextHash = await hash(value, 10);
    await db
      .update(settings)
      .set(
        column === "adminPasswordHash"
          ? { adminPasswordHash: nextHash }
          : { adminPinHash: nextHash },
      )
      .where(eq(settings.id, SETTINGS_ID));
  }
}

/** Seed or reconcile both admin secrets; called at the top of every login. */
export async function ensureAdminSecrets(): Promise<void> {
  await ensureSettingsRow();
  await syncAdminSecretsFromEnv();
}
