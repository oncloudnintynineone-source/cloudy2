"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { eventTitleTemplates, settings } from "@/db/schema";
import {
  formatBannerColorLabel,
  normalizeBannerColor,
  validateBannerForm,
  type BannerFormValues,
} from "@/lib/banner/banner";
import { AUDIT_ACTIONS, actorFromUser } from "@/lib/audit/build";
import { diffFields } from "@/lib/audit/diff";
import { logAction } from "@/lib/audit/log";
import { invalidateConfigCache } from "@/lib/configCache";
import { purgeGcalCache } from "@/lib/google/eventsCache";
import { validateKahNotificationsForm, type KahNotificationsFormValues } from "@/lib/kah/validate";
import { requireAdmin } from "@/lib/session";
import {
  EVENT_TITLE_ASSIGNMENT_TARGETS,
  EVENT_TITLE_TARGET_LABELS,
  EVENT_TITLE_TEMPLATES_MAX_COUNT,
  normalizeAssignments,
  normalizeKeyword,
  normalizeRetentionDays,
  validateAssignments,
  validateNameTemplate,
  validateRetentionForm,
  type EventTitleAssignmentTarget,
} from "@/lib/settings/validate";
import {
  sanitizeTitleRecipe,
  validateTitleRecipe,
  type TitleRecipe,
} from "@/lib/settings/titleRecipe";

export type SettingsActionResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      field?:
        | "keyword"
        | "nameTemplate"
        | "recipe"
        | "retentionDays"
        | "bannerText"
        | "kahEmails"
        | "kahSubject"
        | "kahBody"
        | "templateLabel"
        | "assignments";
    };

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

/** Validate + sanitize an incoming recipe for storage, or return an error string. */
function preparedRecipe(recipe: TitleRecipe): { recipe: TitleRecipe } | { error: string } {
  const errors = validateTitleRecipe(recipe);
  if (errors.recipe) {
    return { error: errors.recipe };
  }
  return { recipe: sanitizeTitleRecipe(recipe) };
}

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
    details: diffFields({ userKeyword: before?.userKeyword ?? null }, { userKeyword: normalized }),
  });

  invalidateConfigCache(["settings"]);
  revalidatePath("/settings/security");
  return { ok: true };
}

export async function updateNameTemplate(template: string): Promise<SettingsActionResult> {
  const session = await requireAdmin();

  const errors = validateNameTemplate({ nameTemplate: template });
  if (errors.nameTemplate) {
    return {
      ok: false,
      error: errors.nameTemplate,
      field: "nameTemplate",
    };
  }

  const normalized = template.trim();
  const [before] = await db.select().from(settings).limit(1);

  await db
    .update(settings)
    .set({ nameTemplate: normalized, updatedAt: new Date() })
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
    method: "updateNameTemplate",
    details: diffFields(
      { nameTemplate: before?.nameTemplate ?? null },
      { nameTemplate: normalized },
    ),
  });

  invalidateConfigCache(["settings"]);
  revalidatePath("/settings/templates");
  return { ok: true };
}

export async function updateEventTitleRecipe(recipe: TitleRecipe): Promise<SettingsActionResult> {
  const session = await requireAdmin();

  const prepared = preparedRecipe(recipe);
  if ("error" in prepared) {
    return { ok: false, error: prepared.error, field: "recipe" };
  }
  const normalized = prepared.recipe;
  const [before] = await db.select().from(settings).limit(1);

  await db
    .update(settings)
    .set({ eventTitleRecipe: normalized, updatedAt: new Date() })
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
    method: "updateEventTitleRecipe",
    details: diffFields(
      {
        eventTitleRecipe: sanitizeTitleRecipe(
          (before as unknown as { eventTitleRecipe?: unknown })?.eventTitleRecipe,
        ),
      },
      { eventTitleRecipe: normalized },
    ),
  });

  invalidateConfigCache(["settings"]);
  revalidatePath("/settings/templates");
  revalidatePath("/dashboard");
  return { ok: true };
}

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
  const prepared = preparedRecipe(recipe);
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
  const prepared = preparedRecipe(recipe);
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

export async function updateEventTitleTemplateAssignments(
  assignments: Record<string, string | null>,
): Promise<SettingsActionResult> {
  const session = await requireAdmin();
  const templates = await db.select().from(eventTitleTemplates);
  const knownIds = new Set(templates.map((t) => t.id));
  // Allow null/empty to mean master fallback; only known targets are stored.
  const cleaned: Record<string, string> = {};
  for (const target of EVENT_TITLE_ASSIGNMENT_TARGETS) {
    const tid = assignments[target];
    if (tid == null || tid === "") continue;
    cleaned[target] = tid.trim();
  }
  const errors = validateAssignments(cleaned, knownIds);
  if (Object.keys(errors).length > 0) {
    const first = Object.entries(errors)[0];
    return { ok: false, error: first[1], field: "assignments" };
  }

  const [before] = await db.select().from(settings).limit(1);
  const beforeAssignments = normalizeAssignments(
    (before as unknown as { eventTitleTemplateAssignments?: unknown })
      ?.eventTitleTemplateAssignments,
  );

  await db
    .update(settings)
    .set({ eventTitleTemplateAssignments: cleaned, updatedAt: new Date() })
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
    method: "updateEventTitleTemplateAssignments",
    details: diffFields({ assignments: beforeAssignments }, { assignments: cleaned }),
  });

  invalidateConfigCache(["settings"]);
  revalidatePath("/settings/templates");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateAuditLogRetention(days: number): Promise<SettingsActionResult> {
  const session = await requireAdmin();

  const errors = validateRetentionForm({ retentionDays: days });
  if (errors.retentionDays) {
    return {
      ok: false,
      error: errors.retentionDays,
      field: "retentionDays",
    };
  }

  const retentionDays = normalizeRetentionDays(days);
  const [before] = await db.select().from(settings).limit(1);

  await db
    .update(settings)
    .set({ auditLogRetentionDays: retentionDays, updatedAt: new Date() })
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
    method: "updateAuditLogRetention",
    details: diffFields(
      { auditLogRetentionDays: before?.auditLogRetentionDays ?? null },
      { auditLogRetentionDays: retentionDays },
    ),
  });

  invalidateConfigCache(["settings"]);
  revalidatePath("/settings/general");
  return { ok: true };
}

export async function updateBanner(values: BannerFormValues): Promise<SettingsActionResult> {
  const session = await requireAdmin();

  const errors = validateBannerForm(values);
  if (errors.text) {
    return {
      ok: false,
      error: errors.text,
      field: "bannerText",
    };
  }

  const enabled = values.enabled === true;
  const text = values.text.trim();
  const color = normalizeBannerColor(values.color);
  const [before] = await db.select().from(settings).limit(1);

  await db
    .update(settings)
    .set({
      bannerEnabled: enabled,
      bannerText: text,
      bannerColor: color,
      updatedAt: new Date(),
    })
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
    method: "updateBanner",
    details: diffFields(
      {
        bannerEnabled: before?.bannerEnabled ?? false,
        bannerText: before?.bannerText ?? "",
        bannerColor: formatBannerColorLabel(before?.bannerColor),
      },
      {
        bannerEnabled: enabled,
        bannerText: text,
        bannerColor: formatBannerColorLabel(color),
      },
    ),
  });

  invalidateConfigCache(["settings"]);
  revalidatePath("/settings/banner");
  return { ok: true };
}

export async function updateKahNotifications(
  values: KahNotificationsFormValues,
): Promise<SettingsActionResult> {
  const session = await requireAdmin();

  const errors = validateKahNotificationsForm(values);
  if (errors.subjectTemplate || errors.bodyTemplate) {
    return {
      ok: false,
      error: errors.subjectTemplate ?? errors.bodyTemplate!,
      field: errors.subjectTemplate ? "kahSubject" : "kahBody",
    };
  }

  const subject = values.subjectTemplate.trim();
  const body = values.bodyTemplate.trim();
  const [before] = await db.select().from(settings).limit(1);

  await db
    .update(settings)
    .set({
      kahEmailSubjectTemplate: subject,
      kahEmailBodyTemplate: body,
      updatedAt: new Date(),
    })
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
    method: "updateKahNotifications",
    details: diffFields(
      {
        kahEmailSubjectTemplate: before?.kahEmailSubjectTemplate ?? null,
        kahEmailBodyTemplate: before?.kahEmailBodyTemplate ?? null,
      },
      { kahEmailSubjectTemplate: subject, kahEmailBodyTemplate: body },
    ),
  });

  invalidateConfigCache(["settings"]);
  revalidatePath("/settings/general");
  revalidatePath("/settings/kah-groups");
  return { ok: true };
}

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
