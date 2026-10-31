/**
 * Feature-flag registry (Settings → Feature Flags). Each entry is a typed,
 * pure-data definition whose `key` must equal the `settings` column name the
 * flag is stored in. The settings page renders one labeled control per
 * registered flag and `getFeatureFlags` / `updateFeatureFlags` read and write
 * through the registry — so shipping a future flag is: add the column to
 * `src/db/schema.ts`, add one entry here, and nothing else changes.
 *
 * Flags that have finished their live A/B trial are retired: their winning
 * variant is locked in `LOCKED_VARIANTS`, their settings column/control is
 * removed, and consumers read the constant instead. See `docs/feature-flags.md`.
 *
 * Kept free of I/O and framework code so it unit-tests without a database.
 */

import { MOTION_PROFILE_OPTIONS, type MotionProfile } from "@/lib/motion/profile";

export interface FeatureFlagDef<TKey extends string = string, TOption extends string = string> {
  /** Must match the `settings` column name (camelCase) the flag is stored in. */
  key: TKey;
  /** UI label shown on the Feature Flags page. */
  label: string;
  /** Short description shown under the label. */
  description: string;
  /** Closed set of allowed values; also the SegmentedControl's options. */
  options: readonly TOption[];
  /** Display caption for each option (parallel to `options`). */
  optionLabels: Record<TOption, string>;
  /** Value used when the stored value is missing, blank or unknown. */
  defaultValue: TOption;
}

// --- Locked-in variants ----------------------------------------------------
//
// The winners of the retired A/B flags. These are fixed in code (no settings
// column, no admin control); components still implement the other variants,
// but the app always resolves these values.

export type PinnedTickerIndicator = "classic" | "split" | "segmented" | "badge" | "stacked";
export type TranslucencyLevel = "subtle" | "medium" | "strong";
export type ReorderDrag = "drag" | "arrowsDrag" | "arrows";
export type BottomNavVariant = "wide" | "medium" | "tight";
export type WizardStepIndicator = "rail" | "guided" | "classic";

export const LOCKED_VARIANTS = {
  /** Split pill — two-tone counter + countdown chip. */
  pinnedTickerIndicator: "split",
  /** Subtle — the most see-through frosted-glass level. */
  translucencyLevel: "subtle",
  /** Drag only — handle-based reorder, no up/down chevrons. */
  reorderDrag: "drag",
  /** Tight — 72px mobile scrolling-rail tiles. */
  bottomNavVariant: "tight",
  /** Labels + step list — desktop labels, mobile step list. */
  wizardStepIndicator: "guided",
} as const satisfies {
  pinnedTickerIndicator: PinnedTickerIndicator;
  translucencyLevel: TranslucencyLevel;
  reorderDrag: ReorderDrag;
  bottomNavVariant: BottomNavVariant;
  wizardStepIndicator: WizardStepIndicator;
};

// --- Live flags ------------------------------------------------------------

export const SAVED_EVENT_TOAST_OPTIONS = [
  "pill",
  "pillRestyle",
  "toastAction",
  "toastPlain",
] as const;
export type SavedEventToastVariant = (typeof SAVED_EVENT_TOAST_OPTIONS)[number];

export const savedEventToastVariantFlag: FeatureFlagDef<
  "savedEventToastVariant",
  SavedEventToastVariant
> = {
  key: "savedEventToastVariant",
  label: "Saved-event confirmation",
  description:
    'How the post-save "Event created/updated" feedback presents: the classic ' +
    'two-tone pill, a confirmation-styled pill, a standard toast with a "View ' +
    'event" action, or a plain toast. Toggle to compare the variants live, then ' +
    "keep the one you want.",
  options: SAVED_EVENT_TOAST_OPTIONS,
  optionLabels: {
    pill: "Classic pill",
    pillRestyle: "Restyled pill",
    toastAction: "Toast + View event",
    toastPlain: "Toast only",
  },
  defaultValue: "pill",
};

export const motionProfileFlag: FeatureFlagDef<"motionProfile", MotionProfile> = {
  key: "motionProfile",
  label: "Motion profile",
  description:
    "How the app's animations move — every transition, reveal and modal zoom " +
    "follows one shared cadence. Calm is slower and softer, Standard is the " +
    "tuned default, Snappy is fast and crisp with no overshoot, and Playful " +
    "travels further with a springier pop. Reduced-motion and low-end devices " +
    "always collapse the motion regardless of this setting. Toggle to compare " +
    "the profiles live, then keep the one you want.",
  options: MOTION_PROFILE_OPTIONS,
  optionLabels: {
    calm: "Calm",
    standard: "Standard",
    snappy: "Snappy",
    playful: "Playful",
  },
  defaultValue: "standard",
};

export const FEATURE_FLAGS = [savedEventToastVariantFlag, motionProfileFlag] as const;
export type FeatureFlagKey = (typeof FEATURE_FLAGS)[number]["key"];

/** True when the locked reorder mode shows the drag handle. */
export function isReorderDragEnabled(value: string | undefined): boolean {
  return value === "drag" || value === "arrowsDrag";
}

/** True when the locked reorder mode shows the up/down chevrons. */
export function isReorderArrowsEnabled(value: string | undefined): boolean {
  return value === "arrows" || value === "arrowsDrag";
}

export function isFeatureFlagKey(value: unknown): value is FeatureFlagKey {
  return FEATURE_FLAGS.some((def) => def.key === value);
}

/**
 * Resolve a flag's stored value against its definition: a non-string or an
 * option outside the def's closed set falls back to the default, so stale or
 * hand-edited rows can never produce an invalid value.
 */
export function resolveFlagValue<TOption extends string>(
  def: FeatureFlagDef<string, TOption>,
  stored: unknown,
): TOption {
  return typeof stored === "string" && (def.options as readonly string[]).includes(stored)
    ? (stored as TOption)
    : def.defaultValue;
}

/** Resolve every registered flag from a raw settings row's record. */
export function normalizeFeatureFlags(
  raw: Record<string, unknown>,
): Record<FeatureFlagKey, string> {
  const out: Record<string, string> = {};
  for (const def of FEATURE_FLAGS as readonly FeatureFlagDef[]) {
    out[def.key] = resolveFlagValue(def, raw[def.key]);
  }
  return out as Record<FeatureFlagKey, string>;
}

export interface FeatureFlagsErrors {
  [key: string]: string | undefined;
}

/** Flag keys whose value isn't one of their closed option set. */
export function validateFeatureFlags(values: Record<FeatureFlagKey, string>): FeatureFlagsErrors {
  const errors: FeatureFlagsErrors = {};
  for (const def of FEATURE_FLAGS) {
    if (!(def.options as readonly string[]).includes(values[def.key])) {
      errors[def.key] = "Choose one of the available options";
    }
  }
  return errors;
}
