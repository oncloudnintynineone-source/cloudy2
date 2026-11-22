/**
 * Pure chip-cap math behind capped badge rows (docs/ui-ux-improvements.md
 * C6): a long participant/department list is capped to `cap` chips with a
 * "+N" overflow, and the chip naming the signed-in user is **pinned first**
 * so the "(You)" marker never disappears behind the cap.
 */

export interface BadgeCapResult<T> {
  /** Chips to render: self-pinned first, then authored order, ≤ `cap`. */
  visible: T[];
  /** How many items the cap hides (0 when everything is visible). */
  overflow: number;
}

/**
 * Split `items` into the visible prefix and the overflow count. When `isSelf`
 * is given and the self item sits beyond the cap, it is moved to the front
 * (stable for everyone else); a cap at or above the item count is a no-op
 * slice.
 */
export function capBadgeItems<T>(
  items: readonly T[],
  cap: number,
  isSelf?: (item: T) => boolean,
): BadgeCapResult<T> {
  if (cap <= 0) {
    return { visible: [], overflow: items.length };
  }
  if (items.length <= cap) {
    return { visible: [...items], overflow: 0 };
  }
  if (!isSelf) {
    return { visible: items.slice(0, cap), overflow: items.length - cap };
  }
  const selfIndex = items.findIndex(isSelf);
  if (selfIndex < 0 || selfIndex < cap) {
    // No self item, or it already fits inside the cap — plain prefix.
    return { visible: items.slice(0, cap), overflow: items.length - cap };
  }
  // Pin the self chip first: it drops the item at the cap's tail instead.
  const self = items[selfIndex];
  const visible = [self, ...items.filter((_, index) => index !== selfIndex).slice(0, cap - 1)];
  return { visible, overflow: items.length - cap };
}
