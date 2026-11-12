/**
 * Pure helpers for the admin event-type reference migration (Settings → Event
 * Types → Migrate events). Kept free of I/O so the range/cursor rules and the
 * notes-block rewrite can be unit-tested without Google or a database.
 *
 * Existing events reference their type by NAME in the notes block (not by id),
 * so renaming a type leaves old events pointing at a name that no longer
 * exists. The migration rewrites those references (and, optionally, the Google
 * summaries rendered from them).
 */

import { formatInstantToNaive, parseNaiveToInstant } from "@/lib/events/datetime";
import { encodeEventNotes, encodeNotesBlock, parseEventNotes } from "@/lib/events/notes";

/** Default scan floor: "all history" from the app's practical beginning. */
export const MIGRATION_DEFAULT_FROM = "2000-01-01";
/** Earliest date the API/UI accept, so a typo can never scan the stone age. */
export const MIGRATION_MIN_DATE = "1970-01-01";
/** Default forward window: future events already created with the old name. */
export const MIGRATION_FUTURE_YEARS = 2;
/** Latest date the API/UI accept (generous but bounded). */
export const MIGRATION_MAX_FUTURE_YEARS = 20;

export interface MigrationRange {
  fromDate: string;
  toDate: string;
}

/** The default range: all history through two years ahead. */
export function defaultMigrationRange(now: Date = new Date()): MigrationRange {
  const year = Number(formatInstantToNaive(now).slice(0, 4));
  return {
    fromDate: MIGRATION_DEFAULT_FROM,
    toDate: `${year + MIGRATION_FUTURE_YEARS}-12-31`,
  };
}

/** True for a real calendar date in `YYYY-MM-DD` form. */
export function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export interface MigrationRangeErrors {
  fromDate?: string;
  toDate?: string;
}

/**
 * Validate the admin-selected scan range. Returns field-keyed messages so the
 * dialog can mark the offending input; an empty object means valid.
 */
export function validateMigrationRange(
  fromDate: string,
  toDate: string,
  now: Date = new Date(),
): MigrationRangeErrors {
  const errors: MigrationRangeErrors = {};
  const maxDate = `${Number(formatInstantToNaive(now).slice(0, 4)) + MIGRATION_MAX_FUTURE_YEARS}-12-31`;

  if (!isDateOnly(fromDate)) {
    errors.fromDate = "Enter a valid start date";
  } else if (fromDate < MIGRATION_MIN_DATE) {
    errors.fromDate = `Start date must be on or after ${MIGRATION_MIN_DATE}`;
  }

  if (!isDateOnly(toDate)) {
    errors.toDate = "Enter a valid end date";
  } else if (toDate > maxDate) {
    errors.toDate = `End date must be on or before ${maxDate}`;
  }

  if (!errors.fromDate && !errors.toDate && fromDate > toDate) {
    errors.toDate = "End date must be on or after the start date";
  }

  return errors;
}

export interface MigrationYearWindow {
  /** Calendar year of this slice (used by the cursor + progress copy). */
  year: number;
  /** Inclusive start instant. */
  start: Date;
  /** Exclusive end instant. */
  end: Date;
}

/**
 * Split the selected range into one window per calendar year (SGT wall clock,
 * matching the app's datetime conventions). Partial first/last years are
 * clipped so no event outside the admin's chosen range is touched.
 */
export function migrationYears(fromDate: string, toDate: string): MigrationYearWindow[] {
  if (!isDateOnly(fromDate) || !isDateOnly(toDate) || fromDate > toDate) {
    return [];
  }
  const rangeStart = parseNaiveToInstant(`${fromDate} 00:00:00`);
  const rangeEnd = new Date(parseNaiveToInstant(`${toDate} 00:00:00`).getTime() + 24 * 60 * 60_000);
  const startYear = Number(fromDate.slice(0, 4));
  const endYear = Number(toDate.slice(0, 4));
  const windows: MigrationYearWindow[] = [];
  for (let year = startYear; year <= endYear; year += 1) {
    const yearStart = parseNaiveToInstant(`${year}-01-01 00:00:00`);
    const yearEnd = parseNaiveToInstant(`${year + 1}-01-01 00:00:00`);
    const start = new Date(Math.max(yearStart.getTime(), rangeStart.getTime()));
    const end = new Date(Math.min(yearEnd.getTime(), rangeEnd.getTime()));
    if (start.getTime() < end.getTime()) {
      windows.push({ year, start, end });
    }
  }
  return windows;
}

/** Whether an event's notes reference the migration source type. */
export function matchesMigrationSource(description: string, fromName: string): boolean {
  const notes = parseEventNotes(description);
  return typeof notes?.eventType === "string" && notes.eventType === fromName;
}

export interface RewrittenNotes {
  /** The notes reference the source type (whether or not anything changed). */
  matched: boolean;
  /** True when the serialized description actually changed. */
  changed: boolean;
  description: string;
}

/**
 * Replace only the notes block in an event description, preserving everything
 * else byte-for-byte — the human-readable `Edit:` line, the internal marker,
 * and any surrounding text. Handles every stored layout: v1 (JSON only), v2
 * (raw JSON line under the link) and v3 (base64url/brotli block). The notes
 * object itself is round-tripped through the shared encoder, so every other
 * field (people, pin, registration, …) survives untouched.
 */
export function rewriteEventTypeNotes(
  description: string,
  fromName: string,
  toName: string,
): RewrittenNotes {
  const notes = parseEventNotes(description);
  if (!notes || typeof notes.eventType !== "string" || notes.eventType !== fromName) {
    return { matched: false, changed: false, description };
  }
  if (fromName === toName) {
    return { matched: true, changed: false, description };
  }

  const nextBlock = encodeNotesBlock(encodeEventNotes({ ...notes, eventType: toName }));
  const lines = description.split("\n");
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();
    if (!line) {
      continue;
    }
    // `parseEventNotes` accepts both a raw JSON line and an inflatable block
    // line, so this finds the serialized notes regardless of the stored format.
    if (parseEventNotes(line) !== null) {
      lines[index] = nextBlock;
      return { matched: true, changed: true, description: lines.join("\n") };
    }
  }

  // Defensive fallback: the whole description parsed as notes but no single
  // line did (unexpected custom formatting) — replace the description's block
  // with the freshly encoded one rather than leaving a stale reference.
  return { matched: true, changed: true, description: nextBlock };
}

/**
 * Rewrite one saved dashboard tab's `types_filter` array. `null` means "role
 * default" and stays `null`; entries are preserved in order, deduped, and the
 * source name becomes the target name.
 */
export function replaceTypeNameInFilters(
  value: unknown,
  fromName: string,
  toName: string,
): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || entry.length === 0) {
      continue;
    }
    const next = entry === fromName ? toName : entry;
    if (!out.includes(next)) {
      out.push(next);
    }
  }
  return out;
}

export interface MigrationBatch<T> {
  /** Matching items this batch will patch (at most `budget`). */
  selected: T[];
  /** Page items examined (non-matching included); advance the cursor by this. */
  consumed: number;
  /** True when the budget stopped the scan before the page was exhausted. */
  stopped: boolean;
}

/**
 * Pick the matching items a single chunk patches from one page slice. The
 * cursor advances by `consumed` *page items* (not filtered matches), so
 * re-fetching a page after a stopped batch is correct even though migrated
 * copies disappear from the match set on the next listing.
 */
export function selectMigrationBatch<T extends { description: string }>(
  items: readonly T[],
  fromName: string,
  budget: number,
): MigrationBatch<T> {
  const selected: T[] = [];
  let consumed = 0;
  for (const item of items) {
    if (selected.length >= budget) {
      break;
    }
    consumed += 1;
    if (!matchesMigrationSource(item.description, fromName)) {
      continue;
    }
    if (selected.length >= budget) {
      consumed -= 1;
      break;
    }
    selected.push(item);
    if (selected.length >= budget) {
      break;
    }
  }
  return { selected, consumed, stopped: consumed < items.length };
}

/** Opaque resume point for the chunked migration. */
export interface MigrationCursor {
  /** Index into `migrationYears(fromDate, toDate)`. */
  yearIndex: number;
  /** Index into the registered department calendars. */
  calendarIndex: number;
  /** Google page token for this calendar/year, or null for the first page. */
  pageToken: string | null;
  /** Offset within the current page's items (update batch cap / resume point). */
  skip: number;
}

/** Validate a client-supplied cursor against the current range/calendar set. */
export function isMigrationCursor(
  value: unknown,
  yearCount: number,
  calendarCount: number,
): value is MigrationCursor {
  if (!value || typeof value !== "object") {
    return false;
  }
  const cursor = value as Partial<MigrationCursor>;
  return (
    Number.isInteger(cursor.yearIndex) &&
    Number.isInteger(cursor.calendarIndex) &&
    Number.isInteger(cursor.skip) &&
    (cursor.pageToken === null || typeof cursor.pageToken === "string") &&
    (cursor.yearIndex ?? -1) >= 0 &&
    (cursor.yearIndex ?? yearCount) < yearCount &&
    (cursor.calendarIndex ?? -1) >= 0 &&
    (cursor.calendarIndex ?? calendarCount) < calendarCount &&
    (cursor.skip ?? -1) >= 0
  );
}
