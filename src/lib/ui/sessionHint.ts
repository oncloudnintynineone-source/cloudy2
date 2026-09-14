/**
 * Session-scoped "seen once" flag shared by the dashboard's one-time touch
 * hints (the agenda swipe hint, the pinch-to-zoom hint). The flag lives only in
 * the browser's `sessionStorage` (never the database), so a hint appears at
 * most once per browser session — and again on the next cold run.
 *
 * External-store shape (mirrors `parade-state/attendanceStorage.ts`): consumers
 * read through `useSyncExternalStore` and `markSeen` writes storage then
 * notifies subscribers. Every accessor is SSR-safe and a no-op outside the
 * browser.
 */

export interface SessionHint {
  /** Live snapshot: whether the hint has been dismissed this session. */
  getSnapshot: () => boolean;
  /** Server snapshot: never dismissed before hydration. */
  getServerSnapshot: () => boolean;
  /** Subscribe to in-session writes (no cross-tab signal exists for this). */
  subscribe: (listener: () => void) => () => void;
  /** Mark the hint seen for the rest of the session and notify subscribers. */
  markSeen: () => void;
}

function hasSessionStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

/** Build the external store behind one `sessionStorage` key. */
export function createSessionHint(storageKey: string): SessionHint {
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => {
      if (!hasSessionStorage()) return false;
      try {
        return window.sessionStorage.getItem(storageKey) === "1";
      } catch {
        return false;
      }
    },

    getServerSnapshot: () => false,

    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    markSeen: () => {
      if (hasSessionStorage()) {
        try {
          window.sessionStorage.setItem(storageKey, "1");
        } catch {
          // Storage blocked (private mode): the flag simply won't persist.
        }
      }
      for (const listener of listeners) listener();
    },
  };
}
