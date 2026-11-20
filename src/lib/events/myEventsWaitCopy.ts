/**
 * Wait copy for the My Events route's wait overlay
 * (`MyEventsWaitOverlay`, docs/loading-transitions.md §1.4).
 *
 * My Events is the app's one always-fresh content route — the service worker
 * never replays a stale document for it, so every entry pays the full server
 * build (a wide multi-calendar read + the audit union). The overlay dresses
 * that wait with honest, playful "calendar archaeology" lines (what the build
 * is *like*, never a fake progress claim) and a slower tip ticker that teaches
 * the page. Pure data + a modulo picker so the copy is unit-tested without a
 * DOM; the component owns all timing.
 */

/** Headline lines, rotated on the faster cadence. Keep short (≤ 48 chars) so
 *  each fits one line on a 360 px phone; keep the single-char ellipsis "…" to
 *  match the cold-start "Waking from Deep Sleep…" register. */
export const MY_EVENTS_WAIT_LINES = [
  "Flipping through your calendar past…",
  "Dusting off the archives…",
  "Asking Google nicely…",
  "Unearthing events you deleted…",
  "Untangling mine from theirs…",
  "Warming up the time machine…",
] as const;

/** Teaching tips, rotated on the slower cadence. Slightly longer is fine —
 *  they wrap to two balanced lines inside the card. */
export const MY_EVENTS_WAIT_TIPS = [
  "Tap any row to see its full change trail.",
  "Deleted events stay listed — their history stays too.",
  "Widen the range to dig through up to two years.",
] as const;

/**
 * The entry for a rotation tick, wrapping around. An empty list yields ""
 * (the caller renders nothing) rather than throwing — the overlay is purely
 * decorative and must never be able to break a page load.
 */
export function pickRotating(items: readonly string[], tick: number): string {
  if (items.length === 0) {
    return "";
  }
  return items[tick % items.length];
}
