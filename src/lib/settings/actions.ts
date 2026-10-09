"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { eventTitleTemplates, settings } from "@/db/schema";
import { AUDIT_ACTIONS, actorFromUser } from "@/lib/audit/build";
import { diffFields } from "@/lib/audit/diff";
import { logAction } from "@/lib/audit/log";
import { invalidateConfigCache } from "@/lib/configCache";
import { purgeGcalCache } from "@/lib/google/eventsCache";
import { requireAdmin } from "@/lib/session";
import type { BannerFormValues } from "@/lib/banner/banner";
import type { KahNotificationsFormValues } from "@/lib/kah/validate";
import {
  prepareAssignmentsEdit,
  prepareBannerEdit,
  prepareEventTitleRecipeEdit,
  prepareFeatureFlagsEdit,
  prepareKahNotificationsEdit,
  prepareKeywordEdit,
  prepareNameTemplateEdit,
  prepareRetentionEdit,
  type SettingsActionResult,
} from "@/lib/settings/edits";
import type { FeatureFlagKey } from "@/lib/settings/featureFlags";
import {
  EVENT_TITLE_TARGET_LABELS,
  EVENT_TITLE_TEMPLATES_MAX_COUNT,
  normalizeAssignments,
  type EventTitleAssignmentTarget,
} from "@/lib/settings/validate";
import {
  prepareTitleRecipe,
  sanitizeTitleRecipe,
  type TitleRecipe,
} from "@/lib/settings/titleRecipe";
import { editSetting } from "@/lib/settings/write";

export type { SettingsActionResult };

/** The label of a library template: required, single line, unique, ≤40 chars. */
function validateTitleTemplateLabel(label: string, otherLabels: string[]): string | undefined {
  const trimmed = label.trim();
  if (!trimmed) {
    return "Label is required";
  }
  if (/\r|\n/.test(label)) {
    return "Label must be a single line";
  }
  if (trimmed.length > 40) {
    return "Label must be 40 characters or fewer";
  }
  const lower = trimmed.toLowerCase();
  if (otherLabels.some((l) => l.toLowerCase() === lower)) {
    return "Label must be unique";
  }
  return undefined;
}

// --- Singleton field edits -------------------------------------------------
//
// The write ritual (auth, read, update, audit, cache invalidation, revalidate)
// lives in `src/lib/settings/write.ts`; each field's patch/targets live in
// `src/lib/settings/edits.ts`. These actions only bind the input to its edit.

export async function updateKeyword(keyword: string): Promise<SettingsActionResult> {
  return editSetting("updateKeyword", (before) => prepareKeywordEdit(before, keyword));
}

export async function updateNameTemplate(template: string): Promise<SettingsActionResult> {
  return editSetting("updateNameTemplate", (before) => prepareNameTemplateEdit(before, template));
}

export async function updateEventTitleRecipe(recipe: TitleRecipe): Promise<SettingsActionResult> {
  return editSetting("updateEventTitleRecipe", (before) =>
    prepareEventTitleRecipeEdit(before, recipe),
  );
}

export async function updateEventTitleTemplateAssignments(
  assignments: Record<string, string | null>,
): Promise<SettingsActionResult> {
  return editSetting("updateEventTitleTemplateAssignments", async (before) => {
    const templates = await db.select({ id: eventTitleTemplates.id }).from(eventTitleTemplates);
    return prepareAssignmentsEdit(before, assignments, new Set(templates.map((t) => t.id)));
  });
}

export async function updateAuditLogRetention(days: number): Promise<SettingsActionResult> {
  return editSetting("updateAuditLogRetention", (before) => prepareRetentionEdit(before, days));
}

export async function updateBanner(values: BannerFormValues): Promise<SettingsActionResult> {
  return editSetting("updateBanner", (before) => prepareBannerEdit(before, values));
}

export async function updateFeatureFlags(
  values: Partial<Record<FeatureFlagKey, string>>,
): Promise<SettingsActionResult> {
  return editSetting("updateFeatureFlags", (before) => prepareFeatureFlagsEdit(before, values));
}

export async function updateKahNotifications(
  values: KahNotificationsFormValues,
): Promise<SettingsActionResult> {
  return editSetting("updateKahNotifications", (before) =>
    prepareKahNotificationsEdit(before, values),
  );
}

// --- Title-template library (not a singleton edit) -------------------------

export async function createEventTitleTemplate(
  label: string,
  recipe: TitleRecipe,
): Promise<SettingsActionResult> {
  const session = await requireAdmin();
  const existing = await db.select().from(eventTitleTemplates);
  if (existing.length >= EVENT_TITLE_TEMPLATES_MAX_COUNT) {
    return {
      ok: false,
      error: `At most ${EVENT_TITLE_TEMPLATES_MAX_COUNT} templates allowed`,
      field: "templateLabel",
    };
  }
  const labelError = validateTitleTemplateLabel(label, existing.map((r) => r.label));
  if (labelError) return { ok: false, error: labelError, field: "templateLabel" };
  const prepared = prepareTitleRecipe(recipe);
  if ("error" in prepared) {
    return { ok: false, error: prepared.error, field: "recipe" };
  }

  const [created] = await db
    .insert(eventTitleTemplates)
    .values({ label: label.trim(), recipe: prepared.recipe })
    .returning();

  await logAction({
    ...actorFromUser({
      id: session.user.id,
      name: session.user.name ?? null,
      role: session.user.role,
    }),
    action: AUDIT_ACTIONS.settingsUpdate,
    entityType: "settings",
    entityName: "settings",
    method: "createEventTitleTemplate",
    details: { label: created.label, recipe: prepared.recipe, id: created.id },
  });

  invalidateConfigCache(["eventTitleTemplates"]);
  revalidatePath("/settings/templates");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateEventTitleTemplateById(
  id: string,
  label: string,
  recipe: TitleRecipe,
): Promise<SettingsActionResult> {
  const session = await requireAdmin();
  const existing = await db.select().from(eventTitleTemplates);
  const target = existing.find((r) => r.id === id);
  if (!target) return { ok: false, error: "Template not found" };
  const labelError = validateTitleTemplateLabel(
    label,
    existing.filter((r) => r.id !== id).map((r) => r.label),
  );
  if (labelError) return { ok: false, error: labelError, field: "templateLabel" };
  const prepared = prepareTitleRecipe(recipe);
  if ("error" in prepared) {
    return { ok: false, error: prepared.error, field: "recipe" };
  }

  const before = {
    label: target.label,
    recipe: sanitizeTitleRecipe((target as unknown as { recipe?: unknown })?.recipe),
  };
  await db
    .update(eventTitleTemplates)
    .set({ label: label.trim(), recipe: prepared.recipe, updatedAt: new Date() })
    .where(eq(eventTitleTemplates.id, id));

  await logAction({
    ...actorFromUser({
      id: session.user.id,
      name: session.user.name ?? null,
      role: session.user.role,
    }),
    action: AUDIT_ACTIONS.settingsUpdate,
    entityType: "settings",
    entityName: "settings",
    method: "updateEventTitleTemplateById",
    details: diffFields(before, { label: label.trim(), recipe: prepared.recipe }),
  });

  invalidateConfigCache(["eventTitleTemplates"]);
  revalidatePath("/settings/templates");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteEventTitleTemplate(id: string): Promise<SettingsActionResult> {
  const session = await requireAdmin();
  const [row] = await db.select().from(settings).limit(1);
  const assignments = normalizeAssignments(
    (row as unknown as { eventTitleTemplateAssignments?: unknown })?.eventTitleTemplateAssignments,
  );
  const assignedViews = Object.entries(assignments)
    .filter(([, tid]) => tid === id)
    .map(([target]) => EVENT_TITLE_TARGET_LABELS[target as EventTitleAssignmentTarget] ?? target);
  if (assignedViews.length > 0) {
    return {
      ok: false,
      error: `Template is assigned to ${assignedViews.join(", ")} — reassign first`,
      field: "assignments",
    };
  }

  const existing = await db
    .select()
    .from(eventTitleTemplates)
    .where(eq(eventTitleTemplates.id, id));
  if (existing.length === 0) return { ok: false, error: "Template not found" };

  await db.delete(eventTitleTemplates).where(eq(eventTitleTemplates.id, id));

  await logAction({
    ...actorFromUser({
      id: session.user.id,
      name: session.user.name ?? null,
      role: session.user.role,
    }),
    action: AUDIT_ACTIONS.settingsUpdate,
    entityType: "settings",
    entityName: "settings",
    method: "deleteEventTitleTemplate",
    details: { deletedId: id, label: existing[0].label },
  });

  invalidateConfigCache(["eventTitleTemplates", "settings"]);
  revalidatePath("/settings/templates");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function duplicateEventTitleTemplate(id: string): Promise<SettingsActionResult> {
  const session = await requireAdmin();
  const [row] = await db
    .select()
    .from(eventTitleTemplates)
    .where(eq(eventTitleTemplates.id, id));
  if (!row) return { ok: false, error: "Template not found" };

  const existing = await db.select({ label: eventTitleTemplates.label }).from(eventTitleTemplates);
  const taken = new Set(existing.map((r) => r.label.toLowerCase()));
  let label = `Copy of ${row.label}`;
  let suffix = 2;
  while (taken.has(label.toLowerCase())) {
    label = `Copy of ${row.label} ${suffix}`;
    suffix += 1;
  }

  const recipe = sanitizeTitleRecipe((row as unknown as { recipe?: unknown })?.recipe);
  const [created] = await db
    .insert(eventTitleTemplates)
    .values({ label, recipe })
    .returning();

  await logAction({
    ...actorFromUser({
      id: session.user.id,
      name: session.user.name ?? null,
      role: session.user.role,
    }),
    action: AUDIT_ACTIONS.settingsUpdate,
    entityType: "settings",
    entityName: "settings",
    method: "duplicateEventTitleTemplate",
    details: { fromId: id, copiedId: created.id, label: created.label },
  });

  invalidateConfigCache(["eventTitleTemplates"]);
  revalidatePath("/settings/templates");
  revalidatePath("/dashboard");
  return { ok: true };
}

// --- Cache maintenance -----------------------------------------------------

export async function purgeCalendarCache(): Promise<SettingsActionResult> {
  const session = await requireAdmin();

  try {
    await purgeGcalCache();
    await logAction({
      ...actorFromUser({
        id: session.user.id,
        name: session.user.name ?? null,
        role: session.user.role,
      }),
      action: AUDIT_ACTIONS.cachePurge,
      entityType: "cache",
      entityName: "googleEventCache",
      method: "purgeCalendarCache",
    });
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    console.error("[settings] Failed to purge calendar cache", error);
    return { ok: false, error: "Failed to purge calendar cache" };
  }
}
