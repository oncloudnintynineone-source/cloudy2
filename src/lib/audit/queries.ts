/**
 * Read-side of the audit log: filter parsing, keyset pagination, retention
 * purge, and the filter options the UI needs. The pure helpers (parsing,
 * cursor codec, day bounds) are kept free of I/O so they can be unit-tested
 * without a database; the DB functions are used by the settings page and the
 * CSV export route.
 */

import { and, asc, desc, eq, gte, ilike, isNotNull, lte, lt, or, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs, type AuditLog } from "@/db/schema";

export const AUDIT_PAGE_SIZE = 30;

/** The virtual "Admin" pseudo-account logs a null actor id with name "Admin". */
export const ADMIN_ACTOR_NAME = "Admin";

export interface AuditFilters {
  /** Match `actor_name` (snapshot; survives user deletion). */
  actor: string | null;
  /** Match `action` (one of `AUDIT_ACTIONS`). */
  action: string | null;
  /** Match `entity_type`. */
  entityType: string | null;
  /** Free-text search across actor name / entity name / route / method / action. */
  query: string | null;
  /** Inclusive lower date bound, `YYYY-MM-DD` (UTC). */
  from: string | null;
  /** Inclusive upper date bound, `YYYY-MM-DD` (UTC). */
  to: string | null;
  /** Encoded keyset cursor (base64url of `[createdAtMs, id]`). */
  cursor: string | null;
}

export interface AuditCursor {
  createdAtMs: number;
  id: string;
}

export const EMPTY_AUDIT_FILTERS: AuditFilters = {
  actor: null,
  action: null,
  entityType: null,
  query: null,
  from: null,
  to: null,
  cursor: null,
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function single(params: Record<string, string | string[] | undefined>, key: string): string | null {
  const value = params[key];
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return null;
}

/** Keep a `YYYY-MM-DD` value only when it is a real calendar date. */
function validDate(value: string | null): string | null {
  if (!value || !DATE_PATTERN.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const pad = (part: number) => String(part).padStart(2, "0");
  const roundTrip = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate(),
  )}`;
  return roundTrip === value ? value : null;
}

/**
 * Normalize an `AuditFilters`-style record (usually a parsed `searchParams`
 * object) into a fully-validated `AuditFilters`. Invalid values are dropped.
 */
export function parseAuditFilters(
  params: Record<string, string | string[] | undefined>,
): AuditFilters {
  const cursor = single(params, "cursor");
  return {
    actor: single(params, "actor"),
    action: single(params, "action"),
    entityType: single(params, "entity"),
    query: single(params, "q"),
    from: validDate(single(params, "from")),
    to: validDate(single(params, "to")),
    cursor: decodeAuditCursor(cursor) ? cursor : null,
  };
}

/** Encode a row's position as an opaque, URL-safe cursor. */
export function encodeAuditCursor(row: Pick<AuditLog, "createdAt" | "id">): string {
  const payload = JSON.stringify([row.createdAt.getTime(), row.id]);
  return Buffer.from(payload, "utf8").toString("base64url");
}

/** Decode a keyset cursor, or null when malformed/absent. */
export function decodeAuditCursor(cursor: string | null | undefined): AuditCursor | null {
  if (!cursor) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (
      Array.isArray(parsed) &&
      typeof parsed[0] === "number" &&
      Number.isFinite(parsed[0]) &&
      typeof parsed[1] === "string"
    ) {
      return { createdAtMs: parsed[0], id: parsed[1] };
    }
    return null;
  } catch {
    return null;
  }
}

/** Inclusive UTC day bounds for `YYYY-MM-DD` strings. Null inputs yield null bounds. */
export function dayBounds(from: string | null, to: string | null): { start: Date | null; end: Date | null } {
  return {
    start: from ? new Date(`${from}T00:00:00.000Z`) : null,
    end: to ? new Date(`${to}T23:59:59.999Z`) : null,
  };
}

/** Drizzle `where` expressions for a set of filters (without the cursor). */
export function auditFilterConditions(filters: AuditFilters): SQL[] {
  const conditions: SQL[] = [];

  if (filters.actor) {
    conditions.push(eq(auditLogs.actorName, filters.actor));
  }
  if (filters.action) {
    conditions.push(eq(auditLogs.action, filters.action));
  }
  if (filters.entityType) {
    conditions.push(eq(auditLogs.entityType, filters.entityType));
  }
  if (filters.query) {
    const pattern = `%${filters.query}%`;
    conditions.push(
      or(
        ilike(auditLogs.actorName, pattern),
        ilike(auditLogs.entityName, pattern),
        ilike(auditLogs.route, pattern),
        ilike(auditLogs.method, pattern),
        ilike(auditLogs.action, pattern),
      )!,
    );
  }

  const { start, end } = dayBounds(filters.from, filters.to);
  if (start) {
    conditions.push(gte(auditLogs.createdAt, start));
  }
  if (end) {
    conditions.push(lte(auditLogs.createdAt, end));
  }

  return conditions;
}

/**
 * Delete audit rows older than `retentionDays`. Returns the number of rows
 * removed. Uses the `audit_logs_created_idx` index.
 */
export async function purgeExpiredAuditLogs(retentionDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
  const deleted = await db
    .delete(auditLogs)
    .where(lt(auditLogs.createdAt, cutoff))
    .returning({ id: auditLogs.id });
  return deleted.length;
}

export interface AuditLogPage {
  rows: AuditLog[];
  nextCursor: string | null;
}

/**
 * Fetch one page of audit logs, newest first. When `retentionDays` is given
 * the expired rows are purged first (rotation on read). Returns an encoded
 * cursor for the next page, or null when there are no more rows.
 */
export async function listAuditLogs(
  filters: AuditFilters,
  opts: { pageSize?: number; retentionDays?: number | null } = {},
): Promise<AuditLogPage> {
  if (opts.retentionDays != null && opts.retentionDays > 0) {
    await purgeExpiredAuditLogs(opts.retentionDays);
  }

  const pageSize = opts.pageSize ?? AUDIT_PAGE_SIZE;
  const conditions = auditFilterConditions(filters);
  const cursor = decodeAuditCursor(filters.cursor);
  if (cursor) {
    conditions.push(
      or(
        lt(auditLogs.createdAt, new Date(cursor.createdAtMs)),
        and(eq(auditLogs.createdAt, new Date(cursor.createdAtMs)), lt(auditLogs.id, cursor.id)),
      )!,
    );
  }

  const rows = await db
    .select()
    .from(auditLogs)
    .where(and(...conditions))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(pageSize + 1);

  const hasMore = rows.length > pageSize;
  const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
  const last = pageRows[pageRows.length - 1];
  return { rows: pageRows, nextCursor: hasMore && last ? encodeAuditCursor(last) : null };
}

/** Distinct `entity_type` values seen in the log, sorted. */
export async function listAuditEntityTypes(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ value: auditLogs.entityType })
    .from(auditLogs)
    .where(isNotNull(auditLogs.entityType))
    .orderBy(asc(auditLogs.entityType));
  return rows.map((row) => row.value!).filter((value) => value.length > 0);
}

/** Distinct `actor_name` values seen in the log, sorted (includes "Admin"). */
export async function listAuditActors(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ value: auditLogs.actorName })
    .from(auditLogs)
    .where(isNotNull(auditLogs.actorName))
    .orderBy(asc(auditLogs.actorName));
  return rows.map((row) => row.value!).filter((value) => value.length > 0);
}
