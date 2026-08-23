/**
 * Per-date attendance check state for the parade-state page. Checks live only
 * in the browser's localStorage (never the database), keyed by the shown date
 * so each day keeps its own roster. The pure codecs are unit-tested; the
 * accessors below are the only touch point with `window.localStorage` and are
 * SSR-safe no-ops outside the browser.
 */

export const ATTENDANCE_STORAGE_KEY = "cloudy2.parade-attendance";

/** date (YYYY-MM-DD) → checked user ids. */
export type AttendanceRecord = Record<string, string[]>;

/**
 * Parse a stored attendance record. Corrupt or non-conforming JSON yields an
 * empty record instead of throwing; only entries whose value is a string[]
 * survive.
 */
export function parseAttendanceRecord(raw: string | null): AttendanceRecord {
  if (raw === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
  const record: AttendanceRecord = {};
  for (const [date, ids] of Object.entries(parsed as Record<string, unknown>)) {
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) continue;
    record[date] = ids;
  }
  return record;
}

/** Serialize a record, dropping dates with no checked users. */
export function serializeAttendanceRecord(record: AttendanceRecord): string {
  const pruned: AttendanceRecord = {};
  for (const [date, ids] of Object.entries(record)) {
    if (ids.length > 0) pruned[date] = ids;
  }
  return JSON.stringify(pruned);
}

function hasLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** Read the full record, or `{}` when storage is unavailable or corrupt. */
export function loadAttendanceRecord(): AttendanceRecord {
  if (!hasLocalStorage()) return {};
  try {
    return parseAttendanceRecord(window.localStorage.getItem(ATTENDANCE_STORAGE_KEY));
  } catch {
    return {};
  }
}

/** Store one date's checked ids (removes the date when the list is empty). */
export function saveAttendanceIds(date: string, ids: string[]): void {
  if (!hasLocalStorage()) return;
  try {
    const record = loadAttendanceRecord();
    if (ids.length > 0) {
      record[date] = ids;
    } else {
      delete record[date];
    }
    window.localStorage.setItem(ATTENDANCE_STORAGE_KEY, serializeAttendanceRecord(record));
  } catch {
    // Storage full or blocked: attendance is best-effort local state.
  }
}

/** Remove every date's checks. */
export function clearAttendance(): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.removeItem(ATTENDANCE_STORAGE_KEY);
  } catch {
    // Ignore — nothing to clear.
  }
}
