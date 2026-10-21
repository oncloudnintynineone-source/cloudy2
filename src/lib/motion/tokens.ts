/**
 * The app's motion language — the single source of truth for every animation
 * cadence. Nothing outside this module may hardcode a duration, an easing curve
 * or a travel distance: CSS reads the matching `--c2-*` custom properties and
 * JS reads the resolved `MotionTokens` (see `profile.ts` + `useMotion`).
 *
 * Base values here are the *standard* profile's raw numbers; a profile scales
 * them (speed, distance, stagger) and swaps the easing family. The `:root`
 * block in `globals.css` mirrors the standard profile as a pre-hydration /
 * `/login` fallback — a parity test keeps the two in sync.
 */

export type Curve = [number, number, number, number];

/** Base durations in ms, keyed by the semantic role each animation plays. */
export const BASE_DURATIONS_MS = {
  /** Hard cut (used by reduced-motion / low-end tiers). */
  instant: 0,
  /** Hover/focus cross-fades, colour swaps, chevron nudges. */
  micro: 120,
  /** Small one-shot fades and icon swaps. */
  quick: 160,
  /** The default UI transition (menus, reveals, slides). */
  standard: 220,
  /** Larger surfaces that need a beat to read as motion (modals, page enter). */
  emphasized: 260,
  /** A deliberate, unhurried reveal (the login card). */
  deliberate: 480,
  /** Indeterminate looping motion (the activity-bar comet). */
  ambient: 1400,
  /** Spinner rotation. */
  spin: 900,
  /** Mantine popover/menu open-close. */
  popover: 220,
  /** Zoom-from-tapped-element modal — open (grow) phase. */
  modalZoom: 240,
  /** Zoom modals — exit (shrink) phase. */
  modalZoomExit: 200,
  /** Full event-form modal (bottom-right origin). */
  modalForm: 240,
  /** Opacity toggles (route-nav dim, detail cross-fade). */
  fade: 220,
  /** Dashboard grid zoom: the gutter morph and the JS scroll re-anchor tween. */
  zoom: 220,
  /** Action-pill progress sweep (functional, not decorative). */
  pillProgress: 5000,
} as const;

export type DurationKey = keyof typeof BASE_DURATIONS_MS;

/** Base easing curves (cubic-bezier control points). */
export const EASE_OUT: Curve = [0.22, 1, 0.36, 1];
export const EASE_IN: Curve = [0.55, 0, 1, 0.45];
export const EASE_IN_OUT: Curve = [0.65, 0, 0.35, 1];
export const EASE_EMPHASIZED: Curve = [0.2, 0, 0, 1];
export const EASE_SOFT: Curve = [0.25, 0.8, 0.35, 1];
export const EASE_CRISP: Curve = [0.2, 0.9, 0.2, 1];
export const EASE_LINEAR: Curve = [0, 0, 1, 1];

/** Base travel distances in px, used by slide/rise keyframes and WAAPI tweens. */
export const BASE_DISTANCES_PX = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 48,
} as const;

export type DistanceKey = keyof typeof BASE_DISTANCES_PX;

/** Base scale factors for pop/settle animations. */
export const BASE_SCALES = {
  chip: 0.94,
  pop: 0.96,
  fab: 0.82,
  badge: 0.72,
  badgePeak: 1.06,
  tabActive: 0.92,
} as const;

export type ScaleKey = keyof typeof BASE_SCALES;

/** Base stagger between sibling entrance animations (FAB cluster). */
export const BASE_STAGGER_MS = 40;

/** Serialize a cubic-bezier curve to the CSS timing-function string. */
export function curveToCss([x1, y1, x2, y2]: Curve): string {
  return `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;
}

/**
 * A cubic-bezier evaluator (Newton–Raphson solve for `t` at a given `x`) so a
 * JS-driven tween (the grid zoom) can follow the *literal* CSS curve instead of
 * drifting against the CSS transitions that remain in flight.
 */
export function cubicBezier(curve: Curve): (x: number) => number {
  const [x1, y1, x2, y2] = curve;
  const coefA = (a: number, b: number) => 1 - 3 * b + 3 * a;
  const coefB = (a: number, b: number) => 3 * b - 6 * a;
  const coefC = (a: number) => 3 * a;
  const calc = (t: number, a: number, b: number) =>
    ((coefA(a, b) * t + coefB(a, b)) * t + coefC(a)) * t;
  const slope = (t: number, a: number, b: number) =>
    3 * coefA(a, b) * t * t + 2 * coefB(a, b) * t + coefC(a);
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const s = slope(t, x1, x2);
      if (s === 0) break;
      t -= (calc(t, x1, x2) - x) / s;
    }
    return calc(t, y1, y2);
  };
}
