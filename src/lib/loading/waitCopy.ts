/**
 * Wait copy for the shared wait overlay (`src/components/WaitOverlay.tsx`,
 * docs/loading-transitions.md §1.4.1).
 *
 * One home for every slow surface's rotating lines and teaching tips, so the
 * voice stays consistent, the quality rules are unit-tested in one place, and
 * the cold-start set can be drift-guarded against the PWA launch shell's
 * embedded JSON block (`launchShell.test.ts`).
 *
 * The copy is honest: lines describe what a load is *like*, never claim
 * progress precision (no percentages, no "3 of 25 months"). Keep the
 * single-char ellipsis "…" to match the cold-start "Waking from Deep Sleep…"
 * register. Pure data + a modulo picker — the component owns all timing.
 */

/** My Events — the always-fresh wide-window build (docs/event-history.md §1.4.2). */
export const MY_EVENTS_WAIT_LINES = [
  "Flipping through your calendar past…",
  "Dusting off the archives…",
  "Asking Google nicely…",
  "Unearthing events you deleted…",
  "Untangling mine from theirs…",
  "Warming up the time machine…",
] as const;

export const MY_EVENTS_WAIT_TIPS = [
  "Tap any row to see its full change trail.",
  "Deleted events stay listed — their history stays too.",
  "Widen the range to dig through up to two years.",
] as const;

/**
 * Cold start — the rotating subline under the static "Waking from Deep Sleep…"
 * brand headline, worn by BOTH halves of the cold-start surface:
 * `ColdStartBrandOverlay` (dashboard route skeleton) and the PWA launch shell
 * (`public/loading.html`, embedded as the `#c2-boot-lines` JSON block —
 * `launchShell.test.ts` pins the two together). Lines only: the boot overlay
 * stays minimal.
 */
export const COLD_START_WAIT_LINES = [
  "Stretching the database…",
  "Warming the calendar cache…",
  "Counting the sheep… er, events…",
  "Polishing the pixels…",
  "Unfolding the month grid…",
] as const;

/** Double Booking — the 30-day clash scan (docs/user-clashes.md). */
export const DOUBLE_BOOKING_WAIT_LINES = [
  "Squaring up your calendar…",
  "Cross-checking the roster…",
  "Hunting for double-bookings…",
  "Flipping through the next 30 days…",
] as const;

export const DOUBLE_BOOKING_WAIT_TIPS = [
  "The scan covers the next 30 days.",
  "Checking a colleague? Pick them at the top.",
] as const;

/** KAH Status — the 30-day breach scan (docs/kah.md). */
export const KAH_STATUS_WAIT_LINES = [
  "Checking the 30-day horizon…",
  "Seeing who's away and who's overseas…",
  "Weighing the constraints…",
] as const;

export const KAH_STATUS_WAIT_TIPS = [
  "The check looks 30 days ahead.",
  "Breach emails go out automatically.",
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
