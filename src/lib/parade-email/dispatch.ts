/**
 * Daily parade-state email dispatcher. Resolves recipients, claims the day
 * (idempotent via `parade_email_sends`' unique `send_date`), builds the
 * snapshot + email, and sends through the shared notification transport.
 * Best-effort: a failure is recorded and swallowed, and a failed day is left
 * claimable so a later tick retries.
 */

import { eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { paradeEmailSends, users } from "@/db/schema";
import { AUDIT_ACTIONS } from "@/lib/audit/build";
import { logAction } from "@/lib/audit/log";
import { sendNotificationEmail } from "@/lib/email/send";
import { getSettings } from "@/lib/settings/queries";
import { onlyUuidIds } from "@/lib/uuid";

import { loadParadeSnapshot } from "./context";
import { buildParadeStateEmail } from "./report";
import { paradeEmailDate, paradeEmailDue, type ParadeEmailDueReason } from "./schedule";

export interface ParadeEmailActor {
  id: string | null;
  name: string | null;
  role: string;
}

export interface RunParadeStateEmailInput {
  trigger: "cron" | "test";
  /** Target date (`YYYY-MM-DD`); defaults to today (UTC+8). */
  date?: string;
  /** Send to these addresses instead of the configured recipients (test). */
  to?: string[];
  /** Bypass the enabled/time/dedup gates (test sends). */
  force?: boolean;
  actor?: ParadeEmailActor;
}

export type ParadeEmailSkipReason = ParadeEmailDueReason | "no-emails" | "error";

export interface ParadeEmailRunResult {
  sent: boolean;
  skipped?: ParadeEmailSkipReason;
  /** Present when `skipped === "error"`: the swallowed dispatch failure. */
  error?: string;
  date: string;
  recipients: number;
  present?: number;
  total?: number;
}

/** Resolve deduplicated, non-empty emails for a set of user ids. */
async function resolveRecipientEmails(userIds: string[]): Promise<string[]> {
  const ids = [...new Set(onlyUuidIds(userIds))];
  if (ids.length === 0) {
    return [];
  }
  const rows = await db.select({ email: users.email }).from(users).where(inArray(users.id, ids));
  const emails = new Set<string>();
  for (const row of rows) {
    if (row.email?.trim()) {
      emails.add(row.email.trim());
    }
  }
  return [...emails];
}

async function existingSendStatus(date: string): Promise<string | null> {
  const [row] = await db
    .select({ status: paradeEmailSends.status })
    .from(paradeEmailSends)
    .where(eq(paradeEmailSends.sendDate, date))
    .limit(1);
  return row?.status ?? null;
}

/**
 * Claim today's send. Returns true when this caller may proceed: either it
 * inserted the row, or a prior attempt failed and is being retried. A row
 * already marked "sent" (or "skipped") blocks the send.
 */
async function claimSend(date: string, recipientCount: number): Promise<boolean> {
  const inserted = await db
    .insert(paradeEmailSends)
    .values({ sendDate: date, status: "sent", recipientCount })
    .onConflictDoNothing({ target: paradeEmailSends.sendDate })
    .returning({ id: paradeEmailSends.id });
  if (inserted.length > 0) {
    return true;
  }
  return (await existingSendStatus(date)) === "failed";
}

async function recordOutcome(
  date: string,
  status: "sent" | "failed",
  recipientCount: number,
  error: string | null,
): Promise<void> {
  const now = new Date();
  await db
    .update(paradeEmailSends)
    .set({ status, recipientCount, sentAt: now, error, updatedAt: now })
    .where(eq(paradeEmailSends.sendDate, date));
}

/**
 * Record one dispatch attempt in the audit log. Every terminal outcome — sent,
 * failed, or skipped — writes a flat row under `paradeState.emailSend` so a
 * silent no-op (disabled, no recipients, already sent, or a swallowed error) is
 * visible after the fact. Best-effort via `logAction` (never throws).
 */
async function auditAttempt(
  input: RunParadeStateEmailInput,
  date: string,
  outcome: "sent" | "failed" | "skipped",
  recipientEmails: string[],
  extra: {
    reason?: string;
    error?: string;
    present?: number;
    total?: number;
    delivered?: boolean;
  } = {},
): Promise<void> {
  await logAction({
    actorId: input.actor?.id ?? null,
    actorName: input.actor?.name ?? null,
    actorRole: input.actor?.role ?? "system",
    action: AUDIT_ACTIONS.paradeStateEmailSend,
    entityType: "paradeStateEmail",
    entityName: date,
    method: input.trigger === "test" ? "sendParadeStateEmailTest" : "runParadeStateEmail",
    details: {
      date,
      trigger: input.trigger,
      outcome,
      reason: extra.reason ?? null,
      error: extra.error ?? null,
      recipients: recipientEmails.join(", "),
      present: extra.present ?? null,
      total: extra.total ?? null,
      delivered: extra.delivered ?? null,
    },
  });
}

/**
 * Run one dispatch attempt. Returns a summary for the caller (the cron route
 * or the "Send Test Now" action). Never throws.
 */
export async function runParadeStateEmail(
  input: RunParadeStateEmailInput,
): Promise<ParadeEmailRunResult> {
  const now = new Date();
  const date = input.date ?? paradeEmailDate(now);

  try {
    const config = await getSettings();
    const recipients = input.force
      ? [...new Set((input.to ?? []).map((email) => email.trim()).filter(Boolean))]
      : await resolveRecipientEmails(config.paradeEmailRecipientIds);

    if (!input.force) {
      const status = await existingSendStatus(date);
      const due = paradeEmailDue({
        enabled: config.paradeEmailEnabled,
        recipientCount: recipients.length,
        alreadySentToday: status === "sent",
      });
      if (!due.due) {
        await auditAttempt(input, date, "skipped", recipients, { reason: due.reason });
        return { sent: false, skipped: due.reason, date, recipients: 0 };
      }
      if (!(await claimSend(date, recipients.length))) {
        await auditAttempt(input, date, "skipped", recipients, { reason: "already-sent" });
        return { sent: false, skipped: "already-sent", date, recipients: 0 };
      }
    } else if (recipients.length === 0) {
      await auditAttempt(input, date, "skipped", recipients, { reason: "no-emails" });
      return { sent: false, skipped: "no-emails", date, recipients: 0 };
    }

    const snapshot = await loadParadeSnapshot(date);
    const report = buildParadeStateEmail({
      date,
      nameTemplate: snapshot.nameTemplate,
      sections: snapshot.sections,
      eventsByUser: snapshot.eventsByUser,
      subjectTemplate: config.paradeEmailSubjectTemplate,
      bodyTemplate: config.paradeEmailBodyTemplate,
      now,
    });
    const subject = input.trigger === "test" ? `[TEST] ${report.subject}` : report.subject;

    const delivered = await sendNotificationEmail({
      to: recipients,
      subject,
      body: report.body,
    });

    if (!input.force) {
      await recordOutcome(
        date,
        delivered ? "sent" : "failed",
        recipients.length,
        delivered ? null : "email transport did not accept the message",
      );
    }

    await auditAttempt(input, date, delivered ? "sent" : "failed", recipients, {
      error: delivered ? undefined : "email transport did not accept the message",
      present: report.present,
      total: report.total,
      delivered,
    });

    return {
      sent: delivered,
      date,
      recipients: recipients.length,
      present: report.present,
      total: report.total,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[parade-email] dispatch failed", error);
    if (!input.force) {
      await recordOutcome(date, "failed", 0, message).catch(() => {});
    }
    await auditAttempt(input, date, "failed", [], { error: message });
    return { sent: false, skipped: "error", error: message, date, recipients: 0 };
  }
}
