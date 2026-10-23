"use server";

import { listEventHistory } from "@/lib/audit/queries";
import { getSettings } from "@/lib/settings/queries";
import { requireSession } from "@/lib/session";
import type { AuditLog } from "@/db/schema";

export interface EventHistoryResult {
  /** Audit rows for the logical event, oldest first (server order). */
  rows: AuditLog[];
  /** Configured audit retention window in days (0 = disabled). */
  retentionDays: number;
}

/**
 * Every recorded audit row (create / update / delete) for one logical event,
 * backing the shared history modal (docs/event-history.md §1.3). Any signed-in
 * user may read it — the same visibility rule as the event itself; grants
 * never gate reads. Fetched fresh on every modal open (no client cache).
 */
export async function getEventHistory(eventId: string): Promise<EventHistoryResult> {
  await requireSession();
  const settings = await getSettings();
  const rows = await listEventHistory(eventId, settings.auditLogRetentionDays);
  return { rows, retentionDays: settings.auditLogRetentionDays };
}
