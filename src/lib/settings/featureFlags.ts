/**
 * Feature-flag registry (Settings → Feature Flags). Each entry is a typed,
 * pure-data definition whose `key` must equal the `settings` column name the
 * flag is stored in. The settings page renders one labeled control per
 * registered flag and `getFeatureFlags` / `updateFeatureFlags` read and write
 * through the registry — so shipping a future flag is: add the column to
 * `src/db/schema.ts`, add one entry here, and nothing else changes.
 *
 * Kept free of I/O and types so it unit-tests without a database.
 */

export interface FeatureFlagDef<TOption extends string = string> {
  /** Must match the `settings` column name (camelCase) the flag is stored in. */
  key: string;
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

export const PINNED_TICKER_INDICATOR_OPTIONS = [
  "classic",
  "split",
  "segmented",
  "badge",
  "stacked",
] as const;
export type PinnedTickerIndicator = (typeof PINNED_TICKER_INDICATOR_OPTIONS)[number];

export const pinnedTickerIndicatorFlag: FeatureFlagDef<PinnedTickerIndicator> = {
  key: "pinnedTickerIndicator",
  label: "Pinned events indicator",
  description:
    "Style of the header's pinned-events pill: how it shows where you are in the " +
    "rotation and how many events are pinned. Toggle to compare the variants live, " +
    "then keep the one you want.",
  options: PINNED_TICKER_INDICATOR_OPTIONS,
  optionLabels: {
    classic: "1/N chip",
    split: "Split pill",
    segmented: "Progress bar",
    badge: "Count badge",
    stacked: "Stacked",
  },
  defaultValue: "classic",
};

export const SAVED_EVENT_TOAST_OPTIONS = [
  "pill",
  "pillRestyle",
  "toastAction",
  "toastPlain",
] as const;
export type SavedEventToastVariant = (typeof SAVED_EVENT_TOAST_OPTIONS)[number];

export const savedEventToastVariantFlag: FeatureFlagDef<SavedEventToastVariant> = {
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

export const TRANSLUCENCY_LEVEL_OPTIONS = ["subtle", "medium", "strong"] as const;
export type TranslucencyLevel = (typeof TRANSLUCENCY_LEVEL_OPTIONS)[number];

export const translucencyLevelFlag: FeatureFlagDef<TranslucencyLevel> = {
  key: "translucencyLevel",
  label: "Interface translucency",
  description:
    "Frosted-glass transparency of the page's overlapping surfaces — sticky " +
    "calendar chrome, bottom navigation, sidebar, floating controls and buttons. " +
    "Subtle is more see-through, Strong is nearly solid (each surface keeps its " +
    "own colour). The header and overlays (modals, menus, tooltips, toasts) stay " +
    "opaque. Low-end devices fall back to a tint without blur. Toggle to compare " +
    "the levels live, then keep the one you want.",
  options: TRANSLUCENCY_LEVEL_OPTIONS,
  optionLabels: {
    subtle: "Subtle",
    medium: "Medium",
    strong: "Strong",
  },
  defaultValue: "medium",
};

export const REORDER_DRAG_OPTIONS = ["drag", "arrowsDrag", "arrows"] as const;
export type ReorderDrag = (typeof REORDER_DRAG_OPTIONS)[number];

export const reorderDragFlag: FeatureFlagDef<ReorderDrag> = {
  key: "reorderDrag",
  label: "Reorder interaction",
  description:
    "How the manageable lists (dashboard views, event-type groups, departments, " +
    "quick links, title recipes) are reordered. Drag only shows a drag handle " +
    "per row (the keyboard path is the handle's Space/Enter + arrow keys); " +
    "Arrows + drag adds the up/down chevrons beside the handle; Arrows only " +
    "keeps just the chevrons.",
  options: REORDER_DRAG_OPTIONS,
  optionLabels: {
    drag: "Drag only",
    arrowsDrag: "Arrows + drag",
    arrows: "Arrows only",
  },
  defaultValue: "drag",
};

export const FEATURE_FLAGS = [
  pinnedTickerIndicatorFlag,
  savedEventToastVariantFlag,
  translucencyLevelFlag,
  reorderDragFlag,
] as const;
export type FeatureFlagKey = (typeof FEATURE_FLAGS)[number]["key"];

/** True when the `reorderDrag` flag shows the drag handle. */
export function isReorderDragEnabled(value: string | undefined): boolean {
  return value === "drag" || value === "arrowsDrag";
}

/** True when the `reorderDrag` flag shows the up/down chevrons. */
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
  def: FeatureFlagDef<TOption>,
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
