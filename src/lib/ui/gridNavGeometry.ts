/**
 * Geometry of the dashboard's floating grid-navigation cluster
 * (`src/components/GridNavControls.tsx`): the stacked zoom pair(s) plus the
 * horizontal pan arrows, anchored to a grid's **visible slice** (the anchor's
 * rect clamped to the viewport and to the mobile FAB-row barrier).
 *
 * The helpers are pure (no DOM, no React) so the anchoring math — and the
 * invariant that the zoom pair never moves when the right pan arrow appears or
 * disappears — is unit-testable without a browser.
 *
 * Both cluster shapes **reserve** the pan-arrow slot (an inert spacer when the
 * grid fits without overflowing). The single-axis cluster used to size itself
 * from the arrow's presence, so the moment a zoom-in made the grid overflow,
 * the cluster grew 57px and the re-centered zoom pair jumped up ~28px — the
 * controls moved under the user's finger exactly when they tapped zoom.
 */

/** Shared geometry of the edge controls: 40px round buttons, 8px gaps inside
 * the right cluster, a 1px divider between the zoom pair(s) and the pan arrow. */
export const CONTROL_BUTTON_SIZE = 40;
export const CLUSTER_GAP = 8;
export const DIVIDER_HEIGHT = 1;
/** 8px inset from each grid edge for the left/right control anchors. */
export const EDGE_INSET = 8;

/** A zoom pair: two buttons plus the gap between them. */
const PAIR_HEIGHT = CONTROL_BUTTON_SIZE * 2 + CLUSTER_GAP;

/** Single-axis cluster: zoom pair + reserved divider + reserved arrow slot. */
export const SINGLE_AXIS_CLUSTER_HEIGHT =
  CONTROL_BUTTON_SIZE * 3 + DIVIDER_HEIGHT + CLUSTER_GAP * 3;

/** Two-axis cluster: columns pair + divider + arrow slot + divider + rows pair. */
export const TWO_AXIS_CLUSTER_HEIGHT =
  CONTROL_BUTTON_SIZE * 5 + DIVIDER_HEIGHT * 2 + CLUSTER_GAP * 6;

/** Distance from the two-axis cluster's top edge to the reserved arrow slot's
 * center: the primary pair, then gap + divider + gap, then half a button. */
export const TWO_AXIS_ARROW_CENTER_FROM_TOP =
  CONTROL_BUTTON_SIZE * 2 + CLUSTER_GAP * 3 + DIVIDER_HEIGHT + CONTROL_BUTTON_SIZE / 2;

/** The anchor's visible slice: the grid's rect clamped to the viewport (and to
 * the bottom barrier's top, when the caller has one). */
export interface VisibleSlice {
  visibleTop: number;
  visibleBottom: number;
  /** The slice's vertical center — the cluster's anchor. */
  center: number;
}

export interface ClusterLayout {
  /** Height of the cluster's bounding box (always the reserved-slot height). */
  height: number;
  /** `top` for the cluster's `position: fixed` wrapper. */
  top: number;
}

/**
 * Pin a fixed-height cluster so its anchor (`anchorFromTop` px from its top
 * edge) lands on the slice center, clamped so it never bleeds past either edge.
 * When the slice is shorter than the cluster, the **zoom pair** is centered in
 * the slice instead (the reserved arrow slot is allowed to overflow evenly), so
 * the pair stays reachable no matter how short the grid's visible strip is.
 */
function anchorTop(height: number, anchorFromTop: number, slice: VisibleSlice): number {
  const sliceHeight = slice.visibleBottom - slice.visibleTop;
  if (sliceHeight >= height) {
    return Math.max(
      slice.visibleTop,
      Math.min(slice.center - anchorFromTop, slice.visibleBottom - height),
    );
  }
  const pairTop = (slice.visibleTop + slice.visibleBottom) / 2 - PAIR_HEIGHT / 2;
  return Math.max(slice.visibleTop, Math.min(pairTop, slice.visibleBottom - PAIR_HEIGHT));
}

/**
 * Day / Week (H), Week (D) and Month clusters: the zoom pair above the (reserved)
 * right pan arrow, the whole cluster centered on the slice center.
 *
 * `arrowVisible` does **not** affect the geometry — the arrow slot and its
 * divider are always rendered (hidden/inert when the grid fits) precisely so the
 * zoom pair holds still while panning and zooming. It is in the signature only
 * to make that invariant explicit and testable.
 */
export function singleAxisCluster(slice: VisibleSlice, arrowVisible: boolean): ClusterLayout {
  void arrowVisible;
  return {
    height: SINGLE_AXIS_CLUSTER_HEIGHT,
    top: anchorTop(SINGLE_AXIS_CLUSTER_HEIGHT, SINGLE_AXIS_CLUSTER_HEIGHT / 2, slice),
  };
}

/**
 * Week (Grid) cluster: the pan arrow sits in the MIDDLE (columns pair above,
 * rows pair below), so the anchor is the reserved arrow slot's center. The
 * arrow slot and both dividers are reserved whether or not the arrow renders.
 */
export function twoAxisCluster(slice: VisibleSlice, arrowVisible: boolean): ClusterLayout {
  void arrowVisible;
  return {
    height: TWO_AXIS_CLUSTER_HEIGHT,
    top: anchorTop(TWO_AXIS_CLUSTER_HEIGHT, TWO_AXIS_ARROW_CENTER_FROM_TOP, slice),
  };
}
