/**
 * Pure helper that renders audit log rows as a CSV document for download.
 * Kept free of I/O so it can be unit-tested without a database.
 */

import type { AuditLog } from "@/db/schema";

/** Escape a CSV field: wrap in double quotes when it contains separators/newlines, doubling inner quotes. */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

const HEADERS = [
  "created_at",
  "actor",
  "actor_role",
  "action",
  "entity_type",
  "entity_id",
  "entity_name",
  "route",
  "method",
  "ip",
  "details",
];

/**
 * Build the full `.csv` body for a set of audit rows. `details` (a jsonb
 * column) is embedded as a stringified JSON field so nothing is lost.
 */
export function buildAuditLogCsv(rows: AuditLog[]): string {
  const lines = rows.map((row) =>
    [
      row.createdAt.toISOString(),
      row.actorName,
      row.actorRole,
      row.action,
      row.entityType,
      row.entityId,
      row.entityName,
      row.route,
      row.method,
      row.ip,
      row.details,
    ]
      .map(csvField)
      .join(","),
  );
  return [HEADERS.join(","), ...lines].join("\n");
}

/** Download filename for the export, e.g. `audit-log-2026-08-20.csv`. */
export function auditCsvFilename(date: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `audit-log-${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate(),
  )}.csv`;
}
