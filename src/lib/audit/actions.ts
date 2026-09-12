"use server";

import { AUDIT_ACTIONS, actorFromUser } from "@/lib/audit/build";
import { logAction } from "@/lib/audit/log";
import { purgeExpiredAuditLogs } from "@/lib/audit/queries";
import { requireAdmin } from "@/lib/session";
import { normalizeRetentionDays } from "@/lib/settings/validate";

export type AuditPurgeResult =
  | { ok: true; deleted: number }
  | { ok: false; error: string };

/**
 * Manually delete audit rows older than `days` (clamped to the retention
 * bounds). The purge itself is audit-logged so admins can see it happened.
 */
export async function purgeAuditLogs(days: number): Promise<AuditPurgeResult> {
  const session = await requireAdmin();

  const retentionDays = normalizeRetentionDays(days);
  try {
    const deleted = await purgeExpiredAuditLogs(retentionDays);
    await logAction({
      ...actorFromUser({
        id: session.user.id,
        name: session.user.name ?? null,
        role: session.user.role,
      }),
      action: AUDIT_ACTIONS.auditPurge,
      entityType: "auditLog",
      entityName: "auditLogs",
      method: "purgeAuditLogs",
      details: { retentionDays, deleted },
    });
    return { ok: true, deleted };
  } catch (error) {
    console.error("[audit] Failed to purge audit logs", error);
    return { ok: false, error: "Failed to purge audit logs" };
  }
}
