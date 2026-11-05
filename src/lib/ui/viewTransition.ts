import { flushSync } from "react-dom";

/**
 * Real View Transitions helpers (docs/loading-transitions.md §1.14.1).
 *
 * The dashboard's period step (month/week/day chevrons, Today, the date
 * picker) runs through `slideViewTransition`: the grid box becomes its own
 * view-transition group (via one of the classes below), the optimistic chrome
 * update commits inside `document.startViewTransition` (with `flushSync`, the
 * documented React recipe), and the CSS keyframes in `globals.css` cross-slide
 * the old and new grid snapshots in the direction of travel. The classes are
 * added only for the duration of the transition so every other update — route
 * changes included — keeps painting through the root group.
 */

/** Class arming the grid group + the forward (next) slide. */
export const GRID_SLIDE_NEXT = "c2-grid-slide-next";
/** Class arming the grid group + the backward (previous) slide. */
export const GRID_SLIDE_PREV = "c2-grid-slide-prev";
/** Class arming the Parade State roster group + the forward (next) slide. */
export const PARADE_SLIDE_NEXT = "c2-parade-slide-next";
/** Class arming the Parade State roster group + the backward (previous) slide. */
export const PARADE_SLIDE_PREV = "c2-parade-slide-prev";

/** The two direction classes of one slideable view-transition group. */
export interface SlideClasses {
  next: string;
  prev: string;
}

const GRID_SLIDES: SlideClasses = { next: GRID_SLIDE_NEXT, prev: GRID_SLIDE_PREV };

/** Whether the browser supports the View Transitions API. */
export function canUseViewTransitions(): boolean {
  return typeof document !== "undefined" && typeof document.startViewTransition === "function";
}

/** Whether the user asked for reduced motion (slides are skipped then). */
export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Whether the weak-device tier is active. The tier's CSS duration collapse
 * (`html.c2-low-end *`) does not reach the `::view-transition-*`
 * pseudo-element tree, so the real slide must stand down in JS too — otherwise
 * a low-end device still pays for two full-region snapshots and their
 * animation (docs/loading-transitions.md §1.14.1).
 */
export function lowEndTierActive(): boolean {
  return (
    typeof document !== "undefined" && document.documentElement.classList.contains("c2-low-end")
  );
}

/**
 * Cross-slide `el`'s content change in the direction of travel (`1` = next /
 * forward, `-1` = previous): the old content exits opposite the direction, the
 * new content enters from the tapped side. `mutate` must apply the React state
 * update synchronously (it runs inside `flushSync` within the transition).
 *
 * Returns `true` when the transition ran (the caller must NOT re-apply
 * `mutate`), `false` when unsupported / reduced motion / the API threw — the
 * caller then applies `mutate` itself and falls back to whatever passive
 * animation it already has.
 */
export function slideViewTransition(
  el: HTMLElement | null,
  dir: 1 | -1,
  mutate: () => void,
  classes: SlideClasses = GRID_SLIDES,
): boolean {
  if (!el || !canUseViewTransitions() || prefersReducedMotion() || lowEndTierActive()) return false;
  const cls = dir > 0 ? classes.next : classes.prev;
  // Re-arm fresh: a held chevron starts a new transition while the previous
  // one is still running (the new one skips it), so drop the stale class
  // before adding the direction for this pass.
  el.classList.remove(classes.next, classes.prev);
  el.classList.add(cls);
  const cleanup = () => el.classList.remove(cls);
  let transition: ViewTransition;
  try {
    transition = document.startViewTransition(() => {
      flushSync(mutate);
    });
  } catch {
    cleanup();
    return false;
  }
  // `finished` resolves once the animation completes and also when the
  // transition is skipped (a superseding transition, a hidden document); it
  // only rejects when the update callback throws — the class must not outlive
  // any of these, or a later route transition would capture the element as a
  // stray named group.
  void transition.finished.then(cleanup, cleanup);
  return true;
}
