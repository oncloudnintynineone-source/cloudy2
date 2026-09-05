/**
 * Fired client-side after any successful event create/update/delete, so
 * mount-long-lived consumers (e.g. the shell's Double Booking nav badge in
 * `AppShellShell.tsx`) can refresh without a navigation. Mirrors
 * `PINNED_EVENTS_CHANGED_EVENT` in `src/lib/ui/pinnedPanel.ts`; the dashboard
 * dispatches it from the same post-mutation completion points that already
 * dispatch the pinned event. Pure client module — no server imports.
 */
export const EVENTS_CHANGED_EVENT = "cloudy2:events-changed";

/** Dispatch `EVENTS_CHANGED_EVENT` on the current document (client only). */
export function notifyEventsChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENTS_CHANGED_EVENT));
  }
}
