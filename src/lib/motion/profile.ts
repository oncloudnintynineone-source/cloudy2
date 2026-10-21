/**
 * Motion profiles — the runtime, admin-selectable tuning layer on top of the
 * base motion tokens (`tokens.ts`). A profile scales the clock (`speed`), the
 * travel (`distance`), the sibling `stagger`, and the overshoot (`bounce`), and
 * picks the easing family. `resolveMotion` produces the numeric tokens JS needs
 * (Mantine only accepts a number duration + a timing-function string), and
 * `motionCssText` produces the matching `:root` custom properties for CSS.
 *
 * Reduced motion and the low-end device tier always collapse the clock to a
 * hard cut — a profile can never re-enable motion for those users.
 */

import {
  BASE_DISTANCES_PX,
  BASE_DURATIONS_MS,
  BASE_SCALES,
  BASE_STAGGER_MS,
  EASE_CRISP,
  EASE_IN,
  EASE_IN_OUT,
  EASE_EMPHASIZED,
  EASE_LINEAR,
  EASE_OUT,
  EASE_SOFT,
  type Curve,
  curveToCss,
} from "./tokens";

export const MOTION_PROFILE_OPTIONS = ["calm", "standard", "snappy", "playful"] as const;
export type MotionProfile = (typeof MOTION_PROFILE_OPTIONS)[number];

interface ProfileParams {
  /** Multiplier applied to every base duration. */
  speed: number;
  /** Multiplier applied to every travel distance. */
  distance: number;
  /** Multiplier applied to the FAB-cluster stagger. */
  stagger: number;
  /** Overshoot amount (0 = no bounce, 1 = a pronounced spring). */
  bounce: number;
  /** The "standard" out-curve this profile uses for entrances. */
  outCurve: Curve;
}

const PROFILES: Record<MotionProfile, ProfileParams> = {
  calm: { speed: 1.2, distance: 1, stagger: 1.25, bounce: 0, outCurve: EASE_SOFT },
  standard: { speed: 1, distance: 1, stagger: 1, bounce: 0.45, outCurve: EASE_OUT },
  snappy: { speed: 0.8, distance: 0.8, stagger: 0.75, bounce: 0, outCurve: EASE_CRISP },
  playful: { speed: 1, distance: 1.15, stagger: 1.1, bounce: 1, outCurve: EASE_OUT },
};

/** `bounce` → a cubic-bezier whose y2 overshoots 1 (entrances only). */
function popCurve(bounce: number): Curve {
  return [0.34, 1 + 0.4 * bounce, 0.64, 1];
}

export interface MotionTokens {
  profile: MotionProfile;
  /** Numeric durations in ms, keyed by semantic role. */
  duration: Record<keyof typeof BASE_DURATIONS_MS, number>;
  /** Easing curves as CSS timing-function strings. */
  easing: {
    out: string;
    in: string;
    inOut: string;
    emphasized: string;
    pop: string;
    linear: string;
  };
  /** The same curves as tuples, for JS tweens that must match the CSS clock. */
  easingCurves: {
    out: Curve;
    in: Curve;
    inOut: Curve;
    emphasized: Curve;
    pop: Curve;
    linear: Curve;
  };
  distance: Record<keyof typeof BASE_DISTANCES_PX, number>;
  scale: Record<keyof typeof BASE_SCALES, number>;
  stagger: number;
}

/**
 * Resolve a profile into concrete tokens. `disabled` (reduced motion or a
 * low-end device) collapses every duration to `instant` so JS tweens snap
 * instead of animating, matching the CSS tiers.
 */
export function resolveMotion(
  profile: MotionProfile,
  opts: { disabled?: boolean } = {},
): MotionTokens {
  const params = PROFILES[profile] ?? PROFILES.standard;
  const scale = (base: number) => (opts.disabled ? 0 : Math.round(base * params.speed));

  const outCurve = params.outCurve;
  const pop = popCurve(params.bounce);

  return {
    profile,
    duration: {
      instant: 0,
      micro: scale(BASE_DURATIONS_MS.micro),
      quick: scale(BASE_DURATIONS_MS.quick),
      standard: scale(BASE_DURATIONS_MS.standard),
      emphasized: scale(BASE_DURATIONS_MS.emphasized),
      deliberate: scale(BASE_DURATIONS_MS.deliberate),
      ambient: scale(BASE_DURATIONS_MS.ambient),
      spin: scale(BASE_DURATIONS_MS.spin),
      popover: scale(BASE_DURATIONS_MS.popover),
      modalZoom: scale(BASE_DURATIONS_MS.modalZoom),
      modalZoomExit: scale(BASE_DURATIONS_MS.modalZoomExit),
      modalForm: scale(BASE_DURATIONS_MS.modalForm),
      fade: scale(BASE_DURATIONS_MS.fade),
      zoom: scale(BASE_DURATIONS_MS.zoom),
      pillProgress: scale(BASE_DURATIONS_MS.pillProgress),
    },
    easing: {
      out: curveToCss(outCurve),
      in: curveToCss(EASE_IN),
      inOut: curveToCss(EASE_IN_OUT),
      emphasized: curveToCss(EASE_EMPHASIZED),
      pop: curveToCss(pop),
      linear: curveToCss(EASE_LINEAR),
    },
    easingCurves: {
      out: outCurve,
      in: EASE_IN,
      inOut: EASE_IN_OUT,
      emphasized: EASE_EMPHASIZED,
      pop,
      linear: EASE_LINEAR,
    },
    distance: {
      xs: Math.round(BASE_DISTANCES_PX.xs * params.distance),
      sm: Math.round(BASE_DISTANCES_PX.sm * params.distance),
      md: Math.round(BASE_DISTANCES_PX.md * params.distance),
      lg: Math.round(BASE_DISTANCES_PX.lg * params.distance),
      xl: Math.round(BASE_DISTANCES_PX.xl * params.distance),
    },
    scale: { ...BASE_SCALES },
    stagger: opts.disabled ? 0 : Math.round(BASE_STAGGER_MS * params.stagger),
  };
}

/** The standard profile's tokens (the CSS fallback + pre-hydration default). */
export const STANDARD_MOTION = resolveMotion("standard");

/**
 * Build the `:root:root { … }` block that publishes the resolved profile as CSS
 * custom properties. `:root:root` (specificity 0,2,0) beats the plain `:root`
 * fallback in `globals.css` so the server-published profile always wins.
 */
export function motionCssText(tokens: MotionTokens): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(tokens.duration)) {
    lines.push(`--c2-dur-${key}: ${value}ms;`);
  }
  lines.push(`--c2-ease-out: ${tokens.easing.out};`);
  lines.push(`--c2-ease-in: ${tokens.easing.in};`);
  lines.push(`--c2-ease-in-out: ${tokens.easing.inOut};`);
  lines.push(`--c2-ease-emphasized: ${tokens.easing.emphasized};`);
  lines.push(`--c2-ease-pop: ${tokens.easing.pop};`);
  lines.push(`--c2-ease-linear: ${tokens.easing.linear};`);
  for (const [key, value] of Object.entries(tokens.distance)) {
    lines.push(`--c2-dist-${key}: ${value}px;`);
  }
  for (const [key, value] of Object.entries(tokens.scale)) {
    lines.push(`--c2-scale-${key}: ${value};`);
  }
  lines.push(`--c2-stagger: ${tokens.stagger}ms;`);
  return `:root:root { ${lines.join(" ")} }`;
}

/**
 * The same tokens as a plain object of CSS custom properties, for the Settings
 * preview (which applies them inline to a scoped wrapper so an unsaved profile
 * can be compared live without touching the global stylesheet).
 */
export function motionStyleVars(tokens: MotionTokens): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(tokens.duration)) {
    vars[`--c2-dur-${key}`] = `${value}ms`;
  }
  vars["--c2-ease-out"] = tokens.easing.out;
  vars["--c2-ease-in"] = tokens.easing.in;
  vars["--c2-ease-in-out"] = tokens.easing.inOut;
  vars["--c2-ease-emphasized"] = tokens.easing.emphasized;
  vars["--c2-ease-pop"] = tokens.easing.pop;
  vars["--c2-ease-linear"] = tokens.easing.linear;
  for (const [key, value] of Object.entries(tokens.distance)) {
    vars[`--c2-dist-${key}`] = `${value}px`;
  }
  for (const [key, value] of Object.entries(tokens.scale)) {
    vars[`--c2-scale-${key}`] = `${value}`;
  }
  vars["--c2-stagger"] = `${tokens.stagger}ms`;
  return vars;
}
