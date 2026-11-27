/**
 * Pure math for the dashboard's **compact desktop chrome tier** — the single-row
 * sticky chrome at `lg`+ (view trigger · period label + chevrons · filter/date,
 * plus the saturated New-event / Quick-links actions) that replaces the wide
 * layout's tab strip + date-nav row when vertical space is scarce.
 *
 * The tier has two triggers (`isCompactDesktop` in `DashboardView`):
 *
 * - the narrow 640–799px desktop band (`isNarrowDesktop`, decided in the
 *   component from the media queries — no horizontal room, so the actions also
 *   go icon-only), and
 * - a **short wide viewport** — the height projection here: when the wide
 *   layout's Month day cell would fit at most
 *   {@link COMPACT_CHROME_CHIP_CEILING} event chips, the compact row buys the
 *   grid back ~45px of height.
 *
 * The projection is deliberately a pure function of the **viewport height**, and
 * always assumes the **tightest month shape** ({@link MAX_MONTH_GRID_ROWS}
 * week rows), never the month currently on screen. Two reasons:
 *
 * 1. **Stability.** The month grid renders its natural 4–6 week rows
 *    (`monthGridRows`, `consistentWeeks={false}`), so a month-derived
 *    projection makes the whole chrome tier — and with it the month chip font,
 *    the CTA sizing and the measured `topChromeHeight` — change as the user
 *    pages months. February 2027 is the only 4-row month between 2024 and 2032:
 *    it used to project three chips (wide), throwing the full desktop chrome
 *    into a run of 5/6-row compact months, then reverting.
 * 2. **No self-feedback.** The projection must never read the *live* box height:
 *    compacting gains a row slot, which would un-compact, which would lose it.
 *
 * Because the worst case (6 rows) is also the smallest projected chip count for
 * a given viewport, the rule is **monotone**: every viewport/month pair that is
 * compact under a month-derived projection is still compact here — the change
 * can only add the chrome saving, never take it away.
 *
 * Pure (no I/O, no React), so the thresholds are unit-tested without a DOM.
 */

import { monthFitChipCount } from "./monthZoom";

/**
 * Vertical budget the wide desktop layout spends above the fit-to-height Month
 * column: the 56px app header plus the two-row sticky chrome (tab strip +
 * date-nav row, ~104px). Used only to project the day-cell chip capacity the
 * *wide* chrome would give, so the compact tier is chosen from the viewport
 * height without the live chrome height feeding back into the decision.
 *
 * Deliberately rounds up: a banner, the pinned weekday strip (~26px) or a
 * safe-area inset makes the real box shorter than this, so the tier engages a
 * touch earlier than the live geometry — the requested bias. The bias can only
 * make the projection pessimistic, never optimistic enough to keep a viewport
 * out of the compact tier that needs it.
 */
export const WIDE_DESKTOP_CHROME_RESERVE_PX = 160;

/**
 * The most week rows any Month grid can render: `ceil((6 + 31) / 7)` — a 31-day
 * month whose 1st falls on the last day of the grid's first column (e.g. a
 * Saturday under a Monday-first week). `2026-08` is exactly that shape under the
 * Monday start; `src/lib/ui/dashboardChrome.test.ts` asserts this constant
 * against `monthGridRows` for every month so it cannot drift from the date math.
 */
export const MAX_MONTH_GRID_ROWS = 6;

/**
 * The chip count at or below which the wide layout counts as "the day only shows
 * a couple of events" — the cue that starts the compact chrome.
 */
export const COMPACT_CHROME_CHIP_CEILING = 2;

/**
 * Chips per day the **wide** layout would fit at this viewport, projected over
 * the fixed wide-chrome budget ({@link WIDE_DESKTOP_CHROME_RESERVE_PX}).
 *
 * `rows` defaults to {@link MAX_MONTH_GRID_ROWS} — production callers must leave
 * it at the default so the tier stays month-independent. It is a parameter only
 * so tests can compare against a specific month shape.
 *
 * `null` for an unmeasured/invalid viewport (the pre-hydration `{0, 0}` that
 * `useViewportSize` returns), so the caller falls back to the wide layout.
 */
export function projectedWideDayChips(
  viewportHeightPx: number,
  rows: number = MAX_MONTH_GRID_ROWS,
): number | null {
  return monthFitChipCount(viewportHeightPx - WIDE_DESKTOP_CHROME_RESERVE_PX, rows);
}

/**
 * Does this viewport height trigger the compact desktop chrome? True when the
 * wide layout would fit no more than {@link COMPACT_CHROME_CHIP_CEILING} chips
 * per day **for the tightest month**, i.e. the compact row would actually buy
 * the grid a legible slot. A pure step function of the viewport height: paging
 * months, switching views, resizing the grid or turning immersive mode on can
 * never change it.
 */
export function compactDesktopForHeight(viewportHeightPx: number): boolean {
  const chips = projectedWideDayChips(viewportHeightPx);
  return chips !== null && chips <= COMPACT_CHROME_CHIP_CEILING;
}
