/**
 * Cold-launch gate for the dashboard skeleton's brand overlay
 * (docs/loading-transitions.md §1.4).
 *
 * The "Waking from Deep Sleep…" overlay is a cold-boot affordance: it should
 * ride the full-area skeleton only while the app's first document load is
 * still settling — not on every soft navigation into the Calendar route.
 *
 * Module state is per JS context: a fresh document load (PWA launch, F5,
 * Force refresh) re-initializes this file with `active = true`, while soft
 * navigations reuse the same context. The cold-start readiness machine
 * (`ColdStartReadyProvider`) calls `markColdLaunchSettled()` once the landing
 * route's tail has finished, retiring the overlay for the rest of the session.
 * Pure and I/O-free — no browser APIs touched.
 */
let active = true;

/** Whether the cold-launch brand overlay may still paint. */
export function isColdLaunchActive(): boolean {
  return active;
}

/** Retire the overlay for the remainder of this document's session. */
export function markColdLaunchSettled(): void {
  active = false;
}
