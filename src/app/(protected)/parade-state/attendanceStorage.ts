/**
 * Per-date attendance check state for the parade-state page. Checks live only
 * in the browser's localStorage (never the database), keyed by the shown date
 * so each day keeps its own roster.
 *
 * The module is an external store: the pure codecs are unit-tested, while the
 * component reads the live record through `useSyncExternalStore`
 * (`subscribeAttendance` / `getAttendanceSnapshot` / `getAttendanceServerSnapshot`).
 * Mutators write storage and notify subscribers, so a reload (with the mode
 * restored from the URL) and cross-tab edits both stay in sync. Every accessor
 * is SSR-safe and a no-op outside the browser.
 */

export const ATTENDANCE_STORAGE_KEY = "cloudy2.parade-attendance";

/** date (YYYY-MM-DD) → checked user ids. */
export type AttendanceRecord = Record<string, string[]>;

/** Stable empty snapshot so `useSyncExternalStore` never sees a fresh object. */
const EMPTY_RECORD: AttendanceRecord = {};

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

// Snapshot cache: `getSnapshot` must return the same reference until the stored
// raw value actually changes, or `useSyncExternalStore` re-renders forever.
let cachedRaw: string | null = null;
let cachedRecord: AttendanceRecord = EMPTY_RECORD;

/** Live snapshot of the stored record (stable identity between writes). */
export function getAttendanceSnapshot(): AttendanceRecord {
  if (!hasLocalStorage()) return EMPTY_RECORD;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(ATTENDANCE_STORAGE_KEY);
  } catch {
    return EMPTY_RECORD;
  }
  if (raw === cachedRaw) return cachedRecord;
  cachedRaw = raw;
  cachedRecord = parseAttendanceRecord(raw);
  return cachedRecord;
}

/** Server snapshot: attendance is a browser-only concern. */
export function getAttendanceServerSnapshot(): AttendanceRecord {
  return EMPTY_RECORD;
}

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Subscribe to record changes, including edits from other tabs. */
export function subscribeAttendance(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key === ATTENDANCE_STORAGE_KEY || event.key === null) onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Store one date's checked ids (removes the date when the list is empty). */
export function saveAttendanceIds(date: string, ids: string[]): void {
  if (!hasLocalStorage()) return;
  try {
    const record = { ...getAttendanceSnapshot() };
    if (ids.length > 0) {
      record[date] = ids;
    } else {
      delete record[date];
    }
    window.localStorage.setItem(ATTENDANCE_STORAGE_KEY, serializeAttendanceRecord(record));
    emit();
  } catch {
    // Storage full or blocked: attendance is best-effort local state.
  }
}

/** Remove every date's checks. */
export function clearAttendance(): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.removeItem(ATTENDANCE_STORAGE_KEY);
    emit();
  } catch {
    // Ignore — nothing to clear.
  }
}
