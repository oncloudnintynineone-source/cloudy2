"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { settings } from "@/db/schema";
import { AUDIT_ACTIONS, actorFromUser } from "@/lib/audit/build";
import { diffFields } from "@/lib/audit/diff";
import { logAction } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/session";
import {
  normalizeKeyword,
  normalizeRetentionDays,
  normalizeWebhookSecret,
  normalizeWebhookUrl,
  validateEventTitleTemplate,
  validateNameTemplate,
  validateRetentionForm,
  validateWebhookForm,
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
        | "webhookUrl"
        | "webhookSecret";
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

export async function updateWebhook(input: {
  webhookUrl: string;
  webhookSecret: string;
  webhookEnabled: boolean;
}): Promise<SettingsActionResult> {
  const session = await requireAdmin();

  const errors = validateWebhookForm(input);
  if (errors.webhookUrl || errors.webhookSecret) {
    return {
      ok: false,
      error: errors.webhookUrl ?? (errors.webhookSecret as string),
      field: errors.webhookUrl ? "webhookUrl" : "webhookSecret",
    };
  }

  // An empty URL is stored as null ("no webhook"); an invalid URL can only
  // come from a stale client, since validateWebhookForm rejects it.
  const url = normalizeWebhookUrl(input.webhookUrl);
  if (url === null) {
    return { ok: false, error: "Enter a valid http(s) URL", field: "webhookUrl" };
  }
  const secret = normalizeWebhookSecret(input.webhookSecret);
  if (secret === null) {
    return { ok: false, error: "Secret is too long", field: "webhookSecret" };
  }

  const [before] = await db.select().from(settings).limit(1);

  await db
    .update(settings)
    .set({
      webhookUrl: url || null,
      webhookSecret: secret || null,
      webhookEnabled: input.webhookEnabled,
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
    method: "updateWebhook",
    details: diffFields(
      {
        webhookEnabled: before?.webhookEnabled ?? false,
        webhookUrl: before?.webhookUrl ?? null,
      },
      { webhookEnabled: input.webhookEnabled, webhookUrl: url || null },
    ),
  });

  revalidatePath("/settings/general");
  return { ok: true };
}
