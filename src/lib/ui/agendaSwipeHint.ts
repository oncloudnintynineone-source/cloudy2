/**
 * Session-scoped "seen" flag for the dashboard's agenda swipe hint. The flag
 * lives only in the browser's `sessionStorage` (never the database) so the
 * touch-only caption appears at most once per browser session.
 *
 * External-store shape (mirrors `parade-state/attendanceStorage.ts`): the
 * component reads through `useSyncExternalStore` and
 * `markAgendaSwipeHintSeen` writes storage then notifies subscribers. Every
 * accessor is SSR-safe and a no-op outside the browser.
 */

export const AGENDA_SWIPE_HINT_STORAGE_KEY = "cloudy2.agenda-swipe-hint";

const listeners = new Set<() => void>();

function hasSessionStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

/** Live snapshot: whether the hint has been dismissed this session. */
export function getAgendaSwipeHintSnapshot(): boolean {
  if (!hasSessionStorage()) return false;
  try {
    return window.sessionStorage.getItem(AGENDA_SWIPE_HINT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Server snapshot: the hint is never dismissed before hydration. */
export function getAgendaSwipeHintServerSnapshot(): boolean {
  return false;
}

/** Subscribe to in-session writes (no cross-tab signal exists for this). */
export function subscribeAgendaSwipeHint(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Mark the hint seen for the rest of the session and notify subscribers. */
export function markAgendaSwipeHintSeen(): void {
  if (hasSessionStorage()) {
    try {
      window.sessionStorage.setItem(AGENDA_SWIPE_HINT_STORAGE_KEY, "1");
    } catch {
      // Storage blocked (private mode): the flag simply won't persist.
    }
  }
  for (const listener of listeners) listener();
}
