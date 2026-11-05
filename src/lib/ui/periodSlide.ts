import type { DashboardViewKind } from "@/lib/dashboardViews/views";

/**
 * View kinds whose period step re-renders a full calendar grid (hundreds of day
 * cells / event chips). A real View Transition snapshots that grid twice, so on
 * a touch device the snapshot + synchronous render is expensive enough to drop
 * frames — these kinds keep the lightweight WAAPI nudge there instead. The
 * Agenda list is deliberately excluded: it is small enough to slide everywhere.
 */
const HEAVY_GRID_KINDS: ReadonlySet<DashboardViewKind> = new Set([
  "month",
  "dual",
  "week",
  "weekv2",
  "weekgrid",
  "schedule",
]);

export interface PeriodSlideConditions {
  /** The renderer kind of the view being stepped. */
  kind: DashboardViewKind;
  /** The grid is showing its skeleton (or its renderer chunk is not mounted). */
  loading: boolean;
  /** Touch-first device (`(pointer: coarse)`). */
  coarsePointer: boolean;
  /** The `c2-low-end` device tier is active. */
  lowEnd: boolean;
}

/**
 * Whether a period step may use the real View Transition cross-slide
 * (docs/loading-transitions.md §1.14.1).
 *
 * The real slide names the whole grid box, synchronously commits a full grid
 * render inside the transition callback (`flushSync`), and lets the browser
 * rasterise/animate two full-grid snapshots. That is affordable on desktop and
 * for the small Agenda list, but on a touch device stepping a heavy grid (or
 * stepping a grid that is still loading its skeleton) it is the source of the
 * observed frame drops. Unsupported browsers and reduced motion are handled
 * separately by `slideViewTransition` itself; this is the additional
 * performance gate. Pure so the policy is unit-tested.
 */
export function shouldUsePeriodSlide(conditions: PeriodSlideConditions): boolean {
  const { kind, loading, coarsePointer, lowEnd } = conditions;
  if (lowEnd || loading) {
    return false;
  }
  return !(coarsePointer && HEAVY_GRID_KINDS.has(kind));
}
