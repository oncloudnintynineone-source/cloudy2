/**
 * The singleton-settings write ritual: authorize, read the before-row, apply
 * the patch, audit the diff, invalidate the config cache, and revalidate the
 * affected paths — one implementation for every Settings field edit
 * (`src/lib/settings/edits.ts` supplies the per-setting patch and targets).
 *
 * The side effects are injectable so the ritual is unit-testable without a
 * database: production uses {@link REAL_DEPS}; tests pass an in-memory fake.
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { settings } from "@/db/schema";
import { AUDIT_ACTIONS, actorFromUser } from "@/lib/audit/build";
import { diffFields } from "@/lib/audit/diff";
import { logAction } from "@/lib/audit/log";
import { invalidateConfigCache } from "@/lib/configCache";
import { requireAdmin } from "@/lib/session";
import type {
  SettingsActionResult,
  SettingsCacheKey,
  SettingsEditOutcome,
  SettingsRow,
} from "@/lib/settings/edits";

export interface SettingsEditDeps {
  requireAdmin: typeof requireAdmin;
  read: () => Promise<SettingsRow | undefined>;
  update: (patch: Partial<SettingsRow>) => Promise<void>;
  log: typeof logAction;
  invalidate: (keys: readonly SettingsCacheKey[]) => void;
  revalidate: (path: string) => void;
}

const REAL_DEPS: SettingsEditDeps = {
  requireAdmin,
  read: async () => {
    const [row] = await db.select().from(settings).limit(1);
    return row;
  },
  update: async (patch) => {
    await db
      .update(settings)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(settings.id, "singleton"));
  },
  log: logAction,
  invalidate: (keys) => invalidateConfigCache(keys),
  revalidate: (path) => revalidatePath(path),
};

/**
 * Authorize, then run one settings-row edit. `prepare` may be async so an edit
 * can read extra state (e.g. known template ids) after auth and the before-row
 * read, never before them.
 */
export async function editSetting(
  method: string,
  prepare: (before: SettingsRow | undefined) => SettingsEditOutcome | Promise<SettingsEditOutcome>,
  deps: SettingsEditDeps = REAL_DEPS,
): Promise<SettingsActionResult> {
  const session = await deps.requireAdmin();
  const before = await deps.read();
  const outcome = await prepare(before);
  if (!outcome.ok) {
    return { ok: false, error: outcome.error, field: outcome.field };
  }

  const { patch, auditBefore, auditAfter, cacheKeys = ["settings"], revalidate } = outcome.prepared;
  await deps.update(patch);

  await deps.log({
    ...actorFromUser({
      id: session.user.id,
      name: session.user.name ?? null,
      role: session.user.role,
    }),
    action: AUDIT_ACTIONS.settingsUpdate,
    entityType: "settings",
    entityName: "settings",
    method,
    details: diffFields(auditBefore, auditAfter),
  });

  deps.invalidate(cacheKeys);
  for (const path of revalidate) {
    deps.revalidate(path);
  }
  return { ok: true };
}
