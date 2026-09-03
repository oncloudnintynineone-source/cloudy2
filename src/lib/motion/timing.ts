/**
 * App-wide motion cadence.
 *
 * Single source of truth for every JS-driven UI transition duration in the
 * app — Mantine `transitionProps` and inline `transition:` styles. Mantine v9
 * has no global duration knob (durations are inlined per component), so
 * retuning the whole app means touching each call site; those sites import
 * their numbers from here instead of hard-coding them.
 *
 * The handful of CSS-keyframe durations in globals.css cannot read this module
 * — they mirror the same values via the `--c2-dur-*` custom properties. Keep
 * both in sync.
 *
 * Retune everything at once with `MOTION_SCALE`, or edit a base value below.
 */

/** Multiplier applied to every base duration (1 = the tuned default). */
export const MOTION_SCALE = 1;

function scaled(baseMs: number): number {
  return Math.round(baseMs * MOTION_SCALE);
}

export const MOTION = {
  /** Menus, popovers and dropdowns (Mantine `transitionProps.duration`). */
  popover: scaled(250),
  /** "Zoom from tapped element" modals — open (grow) phase. */
  modalZoom: scaled(250),
  /** Zoom modals — exit (shrink) phase. */
  modalZoomExit: scaled(220),
  /** Full event-form modal (bottom-right origin, slightly slower). */
  modalForm: scaled(250),
  /** Opacity toggles (route-nav dim, detail cross-fade). */
  fade: scaled(250),
  /** Hover/focus feedback only (chips, disclosure chevrons). */
  micro: scaled(200),
} as const;

export type MotionToken = keyof typeof MOTION;
