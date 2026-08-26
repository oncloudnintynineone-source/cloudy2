"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { webhooks, type Webhook } from "@/db/schema";
import { AUDIT_ACTIONS, actorFromUser } from "@/lib/audit/build";
import { diffFields } from "@/lib/audit/diff";
import { logAction } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/session";
import {
  normalizeWebhookName,
  normalizeWebhookSecret,
  normalizeWebhookUrl,
  validateWebhookForm,
  type WebhookFormValues,
} from "./validate";

export type WebhookActionResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      field?: "name" | "url" | "secret";
    };

function actorFrom(session: Awaited<ReturnType<typeof requireAdmin>>) {
  return actorFromUser({
    id: session.user.id,
    name: session.user.name ?? null,
    role: session.user.role,
  });
}

async function getWebhookOrNull(id: string): Promise<Webhook | null> {
  const [row] = await db.select().from(webhooks).where(eq(webhooks.id, id)).limit(1);
  return row ?? null;
}

/**
 * Normalize a validated form into DB values. The URL and name are required by
 * `validateWebhookForm`, so the null returns here only guard stale clients.
 */
function normalizeForm(input: WebhookFormValues):
  | {
      ok: true;
      values: { name: string; url: string; secret: string | null };
    }
  | {
      ok: false;
      error: string;
      field: "name" | "url" | "secret";
    } {
  const name = normalizeWebhookName(input.name);
  if (name === null) {
    return { ok: false, error: "Name is required (max 100 characters)", field: "name" };
  }
  const url = normalizeWebhookUrl(input.url);
  if (!url) {
    return {
      ok: false,
      error: url === "" ? "URL is required" : "Enter a valid http(s) URL",
      field: "url",
    };
  }
  const secret = normalizeWebhookSecret(input.secret);
  if (secret === null) {
    return { ok: false, error: "Secret is too long", field: "secret" };
  }
  return { ok: true, values: { name, url, secret: secret || null } };
}

/** Audit details for an endpoint, without ever exposing the secret. */
function auditValues(values: { name: string; url: string; enabled: boolean }) {
  return { name: values.name, url: values.url, enabled: values.enabled };
}

export async function createWebhook(input: WebhookFormValues): Promise<WebhookActionResult> {
  const session = await requireAdmin();

  if (Object.keys(validateWebhookForm(input)).length > 0) {
    return { ok: false, error: "Check the highlighted fields", field: "name" };
  }
  const normalized = normalizeForm(input);
  if (!normalized.ok) {
    return normalized;
  }

  const [created] = await db
    .insert(webhooks)
    .values({ ...normalized.values, enabled: input.enabled })
    .returning({ id: webhooks.id });

  await logAction({
    ...actorFrom(session),
    action: AUDIT_ACTIONS.webhookCreate,
    entityType: "webhook",
    entityId: created.id,
    entityName: normalized.values.name,
    method: "createWebhook",
    details: auditValues({ ...normalized.values, enabled: input.enabled }),
  });

  revalidatePath("/settings/webhooks");
  return { ok: true };
}

export async function updateWebhook(
  id: string,
  input: WebhookFormValues,
): Promise<WebhookActionResult> {
  const session = await requireAdmin();

  if (Object.keys(validateWebhookForm(input)).length > 0) {
    return { ok: false, error: "Check the highlighted fields", field: "name" };
  }
  const normalized = normalizeForm(input);
  if (!normalized.ok) {
    return normalized;
  }

  const existing = await getWebhookOrNull(id);
  if (!existing) {
    return { ok: false, error: "Webhook endpoint not found" };
  }

  await db
    .update(webhooks)
    .set({ ...normalized.values, enabled: input.enabled, updatedAt: new Date() })
    .where(eq(webhooks.id, id));

  await logAction({
    ...actorFrom(session),
    action: AUDIT_ACTIONS.webhookUpdate,
    entityType: "webhook",
    entityId: id,
    entityName: normalized.values.name,
    method: "updateWebhook",
    details: diffFields(
      auditValues({ name: existing.name, url: existing.url, enabled: existing.enabled }),
      auditValues({ ...normalized.values, enabled: input.enabled }),
    ),
  });

  revalidatePath("/settings/webhooks");
  return { ok: true };
}

export async function deleteWebhook(id: string): Promise<WebhookActionResult> {
  const session = await requireAdmin();

  const existing = await getWebhookOrNull(id);
  if (!existing) {
    return { ok: true };
  }

  await db.delete(webhooks).where(eq(webhooks.id, id));

  await logAction({
    ...actorFrom(session),
    action: AUDIT_ACTIONS.webhookDelete,
    entityType: "webhook",
    entityId: id,
    entityName: existing.name,
    method: "deleteWebhook",
    details: auditValues({
      name: existing.name,
      url: existing.url,
      enabled: existing.enabled,
    }),
  });

  revalidatePath("/settings/webhooks");
  return { ok: true };
}
