import { db } from "@/db";
import { settings } from "@/db/schema";
import { AUDIT_RETENTION_DEFAULT } from "@/lib/settings/validate";

export interface SettingsView {
  userKeyword: string;
  nameTemplate: string;
  eventTitleTemplate: string;
  auditLogRetentionDays: number;
}

/**
 * Read-only view of the settings row. Never exposes the admin password hash,
 * which lives on the same row.
 */
export async function getSettings(): Promise<SettingsView> {
  const [row] = await db.select().from(settings).limit(1);
  return {
    userKeyword: row?.userKeyword ?? "",
    nameTemplate: row?.nameTemplate ?? "{name}",
    eventTitleTemplate: row?.eventTitleTemplate ?? "{description}",
    auditLogRetentionDays: row?.auditLogRetentionDays ?? AUDIT_RETENTION_DEFAULT,
  };
}
