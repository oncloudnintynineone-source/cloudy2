/**
 * Pure layout math for the shared mobile control pill
 * (`src/components/ControlPill.tsx`) — the bottom floating row the calendar,
 * Parade State, Contacts and the settings list pages all ride.
 *
 * The pill's row is a wrapping flex line (`.c2-pill-row` in `globals.css`):
 * the leading read-out (period/day label or search field) plus the circular
 * controls in their own horizontally panning strip. Flex **line breaking** uses
 * each item's *hypothetical* main size (its `flex-basis`, ignoring shrink), so
 * the strip shares the line with the label whenever `label + --c2-pill-actions-min`
 * fits and otherwise drops to a full-width second row instead of collapsing to a
 * sliver. That minimum is what these helpers compute — it is deliberately a
 * *floor*, not the strip's content width, so a long run of circles pans
 * (`--c2-pill-scroll`) before it wraps.
 */

/** Circle diameters the app's bottom pills use: the calendar/Parade chrome is
 *  36px, the list-page chrome keeps the 44px touch floor
 *  ([`accessibility.md`](../../../docs/accessibility.md) §1.9). */
export const PILL_CIRCLE = { calendar: 36, list: 44 } as const;

/** How many circles the strip must be able to show before it is allowed to wrap
 *  to its own row. Three is the calendar pill's historical floor (128px of
 *  36px circles + two gaps); list pages pass fewer when they have fewer. */
export const PILL_MIN_VISIBLE_ACTIONS = 3;

/** Minimum width a search field keeps on the label row before the circle strip
 *  wraps below it. Below this the field stops being a usable search box, so the
 *  strip gives up the line instead. */
export const PILL_FIELD_MIN_PX = 140;

/**
 * The `--c2-pill-actions-min` value for a pill: `count` circles plus their
 * `xs` gaps. Emitted as a `calc()` so it tracks the theme's spacing token
 * (and the pill's own `gap`) instead of hardcoding a pixel total.
 */
export function pillActionsMin(
  circleSizePx: number,
  minActions: number = PILL_MIN_VISIBLE_ACTIONS,
): string {
  const count = Math.max(1, Math.floor(minActions));
  return `calc(${count} * ${circleSizePx}px + ${count - 1} * var(--mantine-spacing-xs))`;
}
