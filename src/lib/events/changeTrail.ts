/**
 * Pure shaping for the inline change timeline on My Events
 * (docs/event-history.md §1.4.1): collapses the raw audit trail rows of one
 * logical event into display items (Created → Edited → Deleted), newest first.
 *
 * A cross-department mutation writes one audit row *per calendar copy*, so
 * rows sharing the same action and the same minute collapse into a single
 * item — the same minute-precision convention `latestEventEditTimes` ordering
 * relies on. I/O-free and unit-tested; the visual lives in `MyEventsView`.
 */

import { AUDIT_ACTIONS } from "@/lib/audit/build";
import { actorLabel, changeSummary, formatLogTimestamp } from "@/lib/audit/format";

export type ChangeTrailKind = "create" | "update" | "delete";

/** One displayed trail entry. */
export interface ChangeTrailItem {
  kind: ChangeTrailKind;
  /** "Created" / "Edited" / "Deleted". */
  label: string;
  /** Coarse age, e.g. "just now", "40 min ago", "3 days ago". */
  relative: string;
  /** Absolute UTC+8 stamp (`formatLogTimestamp`), shown on hover. */
  absolute: string;
  /** Who made the change (`actorLabel`). */
  actor: string;
  /** Changed-field labels for an edit; null for create/delete. */
  summary: string | null;
}

/** One audit trail row as the builder needs it (subset of `EventTrailRow`). */
export interface TrailRowInput {
  eventId: string;
  action: string;
  createdAt: Date;
  actorName: string | null;
  actorRole: string | null;
  entityName: string | null;
  details: unknown;
}

const KIND_BY_ACTION: Record<string, ChangeTrailKind> = {
  [AUDIT_ACTIONS.eventCreate]: "create",
  [AUDIT_ACTIONS.eventUpdate]: "update",
  [AUDIT_ACTIONS.eventDelete]: "delete",
};

const KIND_LABELS: Record<ChangeTrailKind, string> = {
  create: "Created",
  update: "Edited",
  delete: "Deleted",
};

/**
 * Coarse relative age of an audit row against `now` (instant math, so no
 * timezone handling): "just now" under a minute, then minutes, hours, days,
 * months, and years.
 */
export function relativeChangeLabel(createdAt: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - createdAt.getTime()) / 60_000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days} ${days === 1 ? "day" : "days"} ago`;
  }
  const months = Math.floor(days / 30);
  if (months < 12) {
    return `${months} ${months === 1 ? "month" : "months"} ago`;
  }
  const years = Math.floor(months / 12);
  return `${years} ${years === 1 ? "year" : "years"} ago`;
}

/**
 * Collapse one event's audit rows (newest first, as `listEventAuditTrail`
 * returns them) into display items: unknown actions (e.g. participant
 * notifications) are dropped, and consecutive rows of the same action within
 * the same minute — the per-copy fan-out of one mutation — become one item.
 */
export function buildChangeTrail(rows: TrailRowInput[], now: Date): ChangeTrailItem[] {
  const items: ChangeTrailItem[] = [];
  let lastKind: ChangeTrailKind | null = null;
  let lastMinute: string | null = null;
  for (const row of rows) {
    const kind = KIND_BY_ACTION[row.action];
    if (!kind) {
      continue;
    }
    const minute = formatLogTimestamp(row.createdAt).slice(0, 16);
    if (kind === lastKind && minute === lastMinute) {
      continue;
    }
    lastKind = kind;
    lastMinute = minute;
    items.push({
      kind,
      label: KIND_LABELS[kind],
      relative: relativeChangeLabel(row.createdAt, now),
      absolute: formatLogTimestamp(row.createdAt),
      actor: actorLabel(row),
      summary: kind === "update" ? changeSummary(row.details, null) : null,
    });
  }
  return items;
}

/** Group trail rows by logical event id, preserving the newest-first order. */
export function groupTrailRows(rows: TrailRowInput[]): Map<string, TrailRowInput[]> {
  const byEvent = new Map<string, TrailRowInput[]>();
  for (const row of rows) {
    const existing = byEvent.get(row.eventId);
    if (existing) {
      existing.push(row);
    } else {
      byEvent.set(row.eventId, [row]);
    }
  }
  return byEvent;
}
