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
import { requireAdmin } from "@/lib/session";
import {
  validateKahNotificationsForm,
  type KahNotificationsFormValues,
} from "@/lib/kah/validate";
import {
  EVENT_TITLE_TEMPLATES_MAX_COUNT,
  normalizeAssignments,
  normalizeKeyword,
  normalizeRetentionDays,
  validateAssignments,
  validateEventTitleLibraryItem,
  validateEventTitleTemplate,
  validateNameTemplate,
  validateRetentionForm,
} from "@/lib/settings/validate";

export type SettingsActionResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      field?:
        | "keyword"
        | "nameTemplate"
        | "eventTitleTemplate"
        | "retentionDays"
        | "bannerText"
        | "kahEmails"
        | "kahSubject"
        | "kahBody"
        | "templateLabel"
        | "template"
        | "assignments";
    };

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

  revalidatePath("/settings/templates");
  return { ok: true };
}

export async function updateEventTitleTemplate(template: string): Promise<SettingsActionResult> {  const session = await requireAdmin();

  const errors = validateEventTitleTemplate({ eventTitleTemplate: template });
  if (errors.eventTitleTemplate) {
    return {
      ok: false,
      error: errors.eventTitleTemplate,
      field: "eventTitleTemplate",
    };
  }

  const normalized = template.trim();
  const [before] = await db.select().from(settings).limit(1);

  await db
    .update(settings)
    .set({ eventTitleTemplate: normalized, updatedAt: new Date() })
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
    method: "updateEventTitleTemplate",
    details: diffFields(
      { eventTitleTemplate: before?.eventTitleTemplate ?? null },
      { eventTitleTemplate: normalized },
    ),
  });

  revalidatePath("/settings/templates");
  return { ok: true };
}

export async function createEventTitleTemplate(
  label: string,
  template: string,
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
  const errors = validateEventTitleLibraryItem(
    { label, template },
    existing.map((r) => r.label),
  );
  if (errors.label) return { ok: false, error: errors.label, field: "templateLabel" };
  if (errors.template) return { ok: false, error: errors.template, field: "template" };

  const [created] = await db
    .insert(eventTitleTemplates)
    .values({ label: label.trim(), template: template.trim() })
    .returning();

  await logAction({
    ...actorFromUser({ id: session.user.id, name: session.user.name ?? null, role: session.user.role }),
    action: AUDIT_ACTIONS.settingsUpdate,
    entityType: "settings",
    entityName: "settings",
    method: "createEventTitleTemplate",
    details: { label: created.label, template: created.template, id: created.id },
  });

  revalidatePath("/settings/templates");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateEventTitleTemplateById(
  id: string,
  label: string,
  template: string,
): Promise<SettingsActionResult> {
  const session = await requireAdmin();
  const existing = await db.select().from(eventTitleTemplates);
  const target = existing.find((r) => r.id === id);
  if (!target) return { ok: false, error: "Template not found" };
  const otherLabels = existing.filter((r) => r.id !== id).map((r) => r.label);
  const errors = validateEventTitleLibraryItem({ label, template }, otherLabels);
  if (errors.label) return { ok: false, error: errors.label, field: "templateLabel" };
  if (errors.template) return { ok: false, error: errors.template, field: "template" };

  const before = { label: target.label, template: target.template };
  await db
    .update(eventTitleTemplates)
    .set({ label: label.trim(), template: template.trim(), updatedAt: new Date() })
    .where(eq(eventTitleTemplates.id, id));

  await logAction({
    ...actorFromUser({ id: session.user.id, name: session.user.name ?? null, role: session.user.role }),
    action: AUDIT_ACTIONS.settingsUpdate,
    entityType: "settings",
    entityName: "settings",
    method: "updateEventTitleTemplateById",
    details: diffFields(before, { label: label.trim(), template: template.trim() }),
  });

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
    .map(([view]) => view);
  if (assignedViews.length > 0) {
    return {
      ok: false,
      error: `Template is assigned to ${assignedViews.join(", ")} — reassign first`,
      field: "assignments",
    };
  }

  const existing = await db.select().from(eventTitleTemplates).where(eq(eventTitleTemplates.id, id));
  if (existing.length === 0) return { ok: false, error: "Template not found" };

  await db.delete(eventTitleTemplates).where(eq(eventTitleTemplates.id, id));

  await logAction({
    ...actorFromUser({ id: session.user.id, name: session.user.name ?? null, role: session.user.role }),
    action: AUDIT_ACTIONS.settingsUpdate,
    entityType: "settings",
    entityName: "settings",
    method: "deleteEventTitleTemplate",
    details: { deletedId: id, label: existing[0].label },
  });

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
  // Allow null/empty to mean master fallback
  const cleaned: Record<string, string> = {};
  for (const [view, tid] of Object.entries(assignments)) {
    if (tid == null || tid === "") continue;
    cleaned[view] = tid.trim();
  }
  const errors = validateAssignments(cleaned, knownIds);
  if (Object.keys(errors).length > 0) {
    const first = Object.entries(errors)[0];
    return { ok: false, error: first[1], field: "assignments" };
  }

  const [before] = await db.select().from(settings).limit(1);
  const beforeAssignments = normalizeAssignments(
    (before as unknown as { eventTitleTemplateAssignments?: unknown })?.eventTitleTemplateAssignments,
  );

  await db
    .update(settings)
    .set({ eventTitleTemplateAssignments: cleaned, updatedAt: new Date() })
    .where(eq(settings.id, "singleton"));

  await logAction({
    ...actorFromUser({ id: session.user.id, name: session.user.name ?? null, role: session.user.role }),
    action: AUDIT_ACTIONS.settingsUpdate,
    entityType: "settings",
    entityName: "settings",
    method: "updateEventTitleTemplateAssignments",
    details: diffFields({ assignments: beforeAssignments }, { assignments: cleaned }),
  });

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

  revalidatePath("/settings/general");
  revalidatePath("/settings/kah-groups");
  return { ok: true };
}
