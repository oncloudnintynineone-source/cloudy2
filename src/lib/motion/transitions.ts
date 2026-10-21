import { transformOriginFromRect, scaleFromRect } from "@/lib/motion/origin";
import { type MotionTokens } from "@/lib/motion/profile";

/**
 * Shared builders for the repeated Mantine `transitionProps` shapes. They take
 * the resolved `MotionTokens` so every overlay reads the same clock and curve as
 * the CSS animations — no per-component literals.
 */

/** Menus, popovers and dropdowns (Mantine's built-in `pop` transition). */
export function popoverTransitionProps(motion: MotionTokens) {
  return {
    transition: "pop",
    duration: motion.duration.popover,
    timingFunction: motion.easing.out,
  };
}

/**
 * "Grow from the tapped element" modal: opens by scaling up from the trigger's
 * rect, closes by shrinking back into it. Entrances use the profile's out-curve
 * (never the bouncy pop), so the shrink-out never overshoots past its origin.
 */
export function modalZoomTransitionProps(
  motion: MotionTokens,
  originRect: { left: number; top: number; width: number; height: number } | null,
  viewport: { w: number; h: number },
  contentWidth: number,
  fallbackOrigin = "center",
  scaleFallback = 0.3,
) {
  return {
    transition: {
      in: { opacity: 1, transform: "scale(1)" },
      out: {
        opacity: 0,
        transform: `scale(${scaleFromRect(originRect, contentWidth, scaleFallback)})`,
      },
      common: {
        transformOrigin: transformOriginFromRect(originRect, viewport, fallbackOrigin),
      },
      transitionProperty: "transform, opacity",
    },
    duration: motion.duration.modalZoom,
    exitDuration: motion.duration.modalZoomExit,
    timingFunction: motion.easing.out,
  };
}

/**
 * The full event-form modal (bottom-right origin, slightly slower). Same
 * grow-from-target mechanic as the zoom modals but with its own duration and a
 * larger shrink scale so the form never collapses to a dot.
 */
export function modalFormTransitionProps(
  motion: MotionTokens,
  originRect: { left: number; top: number; width: number; height: number } | null,
  viewport: { w: number; h: number },
  contentWidth: number,
) {
  return {
    transition: {
      in: { opacity: 1, transform: "scale(1)" },
      out: {
        opacity: 0,
        transform: `scale(${scaleFromRect(originRect, contentWidth, 0.5)})`,
      },
      common: {
        transformOrigin: transformOriginFromRect(originRect, viewport, "bottom right"),
      },
      transitionProperty: "transform, opacity",
    },
    duration: motion.duration.modalForm,
    timingFunction: motion.easing.out,
  };
}

/** A plain opacity cross-fade (route-nav dim, detail cross-fade). */
export function fadeStyle(motion: MotionTokens): string {
  return `opacity ${motion.duration.fade}ms ${motion.easing.out}`;
}
