/**
 * Fired client-side after an account preference is saved (today: week start),
 * so a mounted dashboard revalidates its data in place instead of the dialog
 * reloading the whole document (docs/ui-ux-improvements.md D5). Mirrors
 * `notifyEventsChanged` in `src/lib/ui/eventChanges.ts`; the dispatcher has
 * already cleared the device-local snapshots before firing, so the listener's
 * re-read is authoritative. Pure client module — no server imports.
 */
export const PREFS_CHANGED_EVENT = "cloudy2:prefs-changed";

/** Dispatch `PREFS_CHANGED_EVENT` on the current document (client only). */
export function notifyPrefsChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PREFS_CHANGED_EVENT));
  }
}
