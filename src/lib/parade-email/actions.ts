"use server";

import { after } from "next/server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { settings, users } from "@/db/schema";
import { AUDIT_ACTIONS, actorFromUser } from "@/lib/audit/build";
import { diffFields } from "@/lib/audit/diff";
import { logAction } from "@/lib/audit/log";
import { invalidateConfigCache } from "@/lib/configCache";
import { requireAdmin, requireSession } from "@/lib/session";
import { onlyUuidIds } from "@/lib/uuid";

import { runParadeStateEmail } from "./dispatch";
import { validateParadeEmailForm, type ParadeEmailFormValues } from "./validate";

export type ParadeEmailField =
  | "recipientIds"
  | "sendTime"
  | "days"
  | "subjectTemplate"
  | "bodyTemplate";

export type ParadeEmailActionResult =
  | { ok: true; recipients?: number }
  | { ok: false; error: string; field?: ParadeEmailField };

const FIELD_ORDER: ParadeEmailField[] = [
  "recipientIds",
  "sendTime",
  "days",
  "subjectTemplate",
  "bodyTemplate",
];

/** Persist the daily parade-state email config (Settings → Parade State Email). */
export async function saveParadeEmailSettings(
  values: ParadeEmailFormValues,
): Promise<ParadeEmailActionResult> {
  const session = await requireAdmin();

  const errors = validateParadeEmailForm(values);
  const firstInvalid = FIELD_ORDER.find((field) => errors[field]);
  if (firstInvalid) {
    return { ok: false, error: errors[firstInvalid]!, field: firstInvalid };
  }

  const recipientIds = [...new Set(onlyUuidIds(values.recipientIds))];
  const sendTime = values.sendTime.trim();
  const days = [...new Set(values.days.filter((day) => day >= 1 && day <= 7))].sort(
    (a, b) => a - b,
  );
  const subject = values.subjectTemplate.trim();
  const body = values.bodyTemplate.trim();

  const [before] = await db.select().from(settings).limit(1);

  await db
    .update(settings)
    .set({
      paradeEmailEnabled: values.enabled,
      paradeEmailRecipientIds: recipientIds,
      paradeEmailSendTime: sendTime,
      paradeEmailDays: days,
      paradeEmailSubjectTemplate: subject,
      paradeEmailBodyTemplate: body,
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
    method: "saveParadeEmailSettings",
    details: diffFields(
      {
        paradeEmailEnabled: before?.paradeEmailEnabled ?? null,
        paradeEmailRecipientIds: before?.paradeEmailRecipientIds ?? null,
        paradeEmailSendTime: before?.paradeEmailSendTime ?? null,
        paradeEmailDays: before?.paradeEmailDays ?? null,
        paradeEmailSubjectTemplate: before?.paradeEmailSubjectTemplate ?? null,
        paradeEmailBodyTemplate: before?.paradeEmailBodyTemplate ?? null,
      },
      {
        paradeEmailEnabled: values.enabled,
        paradeEmailRecipientIds: recipientIds,
        paradeEmailSendTime: sendTime,
        paradeEmailDays: days,
        paradeEmailSubjectTemplate: subject,
        paradeEmailBodyTemplate: body,
      },
    ),
  });

  invalidateConfigCache(["settings"]);
  revalidatePath("/settings/parade-email");
  return { ok: true };
}

/**
 * Send a one-off test of the current templates to the acting admin's own email
 * address. Never touches the per-day dedup row, so testing doesn't consume the
 * day's real send.
 */
export async function sendParadeStateEmailTest(): Promise<ParadeEmailActionResult> {
  const session = await requireAdmin();

  const [admin] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  const to = admin?.email?.trim();
  if (!to) {
    return {
      ok: false,
      error: "Your profile has no email address — add one under Settings → Users first",
    };
  }

  const result = await runParadeStateEmail({
    trigger: "test",
    force: true,
    to: [to],
    actor: {
      id: session.user.id,
      name: session.user.name ?? null,
      role: session.user.role,
    },
  });

  if (!result.sent) {
    return {
      ok: false,
      error: "Test email was not delivered — check the email transport configuration",
    };
  }
  return { ok: true, recipients: result.recipients };
}

/**
 * Lazy tick: any authenticated app activity (mount, return-from-background)
 * calls this, and if the configured send window is open and today hasn't been
 * claimed, the daily parade-state email goes out. The actual dispatch runs in
 * `after()` so the caller's response is never delayed, and the unique
 * `send_date` keeps concurrent opens from double-sending. Never throws to the
 * client.
 */
export async function maybeDispatchParadeEmail(): Promise<void> {
  await requireSession();
  after(() => runParadeStateEmail({ trigger: "opportunistic" }));
}
