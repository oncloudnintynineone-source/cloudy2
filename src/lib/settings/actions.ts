"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { settings } from "@/db/schema";
import { AUDIT_ACTIONS, actorFromUser } from "@/lib/audit/build";
import { diffFields } from "@/lib/audit/diff";
import { logAction } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/session";
import { normalizeKeyword } from "@/lib/settings/validate";

export type SettingsActionResult =
  | { ok: true }
  | { ok: false; error: string; field?: "keyword" };

export async function updateKeyword(keyword: string): Promise<SettingsActionResult> {
  const session = await requireAdmin();

  const normalized = normalizeKeyword(keyword);
  if (!normalized) {
    return {
      ok: false,
      error: "Keyword must be 1–12 letters",
      field: "keyword",
    };
  }

  const [before] = await db.select().from(settings).limit(1);

  await db
    .update(settings)
    .set({ userKeyword: normalized, updatedAt: new Date() })
    .where(eq(settings.id, "singleton"));

  await logAction({
    ...actorFromUser({
      id: session.user.id,
      name: session.user.name ?? null,
      role: session.user.role,
    }),
    action: AUDIT_ACTIONS.settingsUpdate,
    entityType: "settings",
    entityName: "settings",
    method: "updateKeyword",
    details: diffFields(
      { userKeyword: before?.userKeyword ?? null },
      { userKeyword: normalized },
    ),
  });

  revalidatePath("/settings/general");
  return { ok: true };
}
