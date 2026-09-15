/**
 * An element's border-box rect in the layout viewport, **ignoring ancestor
 * transforms** — unlike `Element.getBoundingClientRect()`, whose result shifts
 * with any transformed ancestor.
 *
 * The dashboard's fixed pan/zoom controls (`GridNavControls`) anchor to the
 * grid's box, and for Week (D) and Month & Agenda that box lives inside the
 * transiently transformed grid-slide wrapper (`DashboardView`'s `gridSlideRef`,
 * a `translateX(±10%)` Web Animation on every view/date change). Measuring the
 * visual rect during that animation captured a shifted `right` inset, leaving
 * the controls displaced (left or right, by the slide direction) until a
 * resize. Layout coordinates are transform-free, so this is stable across the
 * slide.
 *
 * Walks the `offsetParent` chain (whose `offsetLeft`/`offsetTop` are layout,
 * not visual) and subtracts the window scroll to land in viewport coordinates.
 * Callers must not pass a `position: sticky` element (its flow position, not
 * its stuck one, is returned) or one inside an intermediate scroll container
 * (only the window scroll is accounted for) — the control anchors are neither.
 */
export interface LayoutRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export function layoutRect(el: HTMLElement): LayoutRect {
  let left = 0;
  let top = 0;
  for (let node: HTMLElement | null = el; node; node = node.offsetParent as HTMLElement | null) {
    left += node.offsetLeft;
    top += node.offsetTop;
  }
  left -= window.scrollX;
  top -= window.scrollY;
  const width = el.offsetWidth;
  const height = el.offsetHeight;
  return { left, top, right: left + width, bottom: top + height, width, height };
}
