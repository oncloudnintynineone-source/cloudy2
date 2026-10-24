/**
 * Pure shaping for the event change trail (docs/event-history.md §1.4.1):
 * collapses the raw audit rows of one logical event into display items
 * (Created → Edited → Deleted), newest first. Consumed by the inline My Events
 * timeline (`buildChangeTrail`) and the history modal (`buildHistoryEntries`,
 * which additionally keeps the diff `details`).
 *
 * A cross-department mutation writes one audit row *per calendar copy*, so
 * rows sharing the same action and the same minute collapse into a single
 * item — the same minute-precision convention `latestEventEditTimes` ordering
 * relies on. I/O-free and unit-tested; the visuals live in `MyEventsView` and
 * `EventHistoryEntries`.
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

/**
 * A trail entry as the history modal renders it: identical to the inline
 * {@link ChangeTrailItem} (so a page-load preview and the freshly fetched
 * final list match exactly) plus the collapsed row's `details` for the
 * expandable before→after diff. Preview items carry `details: null` and are
 * not yet expandable.
 */
export interface HistoryEntryItem extends ChangeTrailItem {
  details: unknown;
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

/** One collapsed change group (a mutation, possibly fanned out per copy). */
interface CollapsedChange {
  kind: ChangeTrailKind;
  createdAt: Date;
  actorName: string | null;
  actorRole: string | null;
  summary: string | null;
  details: unknown;
}

/**
 * Shared collapse loop behind both builders: unknown actions (e.g. participant
 * notifications) are dropped, and consecutive rows of the same action within
 * the same minute — the per-copy fan-out of one mutation — become one group,
 * represented by its first (newest, for newest-first input) row.
 */
function collapseTrailRows(rows: TrailRowInput[]): CollapsedChange[] {
  const groups: CollapsedChange[] = [];
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
    groups.push({
      kind,
      createdAt: row.createdAt,
      actorName: row.actorName,
      actorRole: row.actorRole,
      summary: kind === "update" ? changeSummary(row.details, null) : null,
      details: row.details,
    });
  }
  return groups;
}

function toTrailItem(group: CollapsedChange, now: Date): ChangeTrailItem {
  return {
    kind: group.kind,
    label: KIND_LABELS[group.kind],
    relative: relativeChangeLabel(group.createdAt, now),
    absolute: formatLogTimestamp(group.createdAt),
    actor: actorLabel(group),
    summary: group.summary,
  };
}

/**
 * Collapse one event's audit rows (newest first, as `listEventAuditTrail`
 * returns them) into inline-timeline display items.
 */
export function buildChangeTrail(rows: TrailRowInput[], now: Date): ChangeTrailItem[] {
  return collapseTrailRows(rows).map((group) => toTrailItem(group, now));
}

/**
 * The same collapse as {@link buildChangeTrail}, but keeping each group's
 * `details` so the history modal can render expandable before→after diffs.
 * Feed it the event's rows newest-first (reverse `listEventHistory`'s
 * oldest-first result).
 */
export function buildHistoryEntries(rows: TrailRowInput[], now: Date): HistoryEntryItem[] {
  return collapseTrailRows(rows).map((group) => ({
    ...toTrailItem(group, now),
    details: group.details,
  }));
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
