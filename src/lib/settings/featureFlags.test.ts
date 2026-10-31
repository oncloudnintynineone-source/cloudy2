import { describe, expect, it } from "vitest";

import {
  FEATURE_FLAGS,
  LOCKED_VARIANTS,
  isFeatureFlagKey,
  isReorderArrowsEnabled,
  isReorderDragEnabled,
  normalizeFeatureFlags,
  resolveFlagValue,
  validateFeatureFlags,
  motionProfileFlag,
  savedEventToastVariantFlag,
} from "./featureFlags";

describe("feature flag registry", () => {
  it("every flag key maps to a declared default within its options", () => {
    for (const def of FEATURE_FLAGS) {
      expect(def.options).toContain(def.defaultValue);
    }
  });

  it("option labels cover every option", () => {
    for (const def of FEATURE_FLAGS) {
      for (const option of def.options) {
        expect((def.optionLabels as Record<string, string>)[option]).toBeTruthy();
      }
    }
  });

  it("has no duplicate keys (each must be a unique settings column)", () => {
    const keys = FEATURE_FLAGS.map((def) => def.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("only keeps the two live flags", () => {
    expect(FEATURE_FLAGS.map((def) => def.key)).toEqual([
      "savedEventToastVariant",
      "motionProfile",
    ]);
  });
});

describe("LOCKED_VARIANTS", () => {
  it("holds the retired flags' winning values", () => {
    expect(LOCKED_VARIANTS).toEqual({
      pinnedTickerIndicator: "split",
      translucencyLevel: "subtle",
      reorderDrag: "drag",
      bottomNavVariant: "tight",
      wizardStepIndicator: "guided",
    });
  });
});

describe("resolveFlagValue", () => {
  it("returns a valid stored value unchanged", () => {
    expect(resolveFlagValue(savedEventToastVariantFlag, "toastPlain")).toBe("toastPlain");
    expect(resolveFlagValue(motionProfileFlag, "playful")).toBe("playful");
  });

  it("falls back to the default for unknown values", () => {
    for (const unknown of ["fancy", "", 42, null, undefined, {}, "classic"]) {
      expect(resolveFlagValue(savedEventToastVariantFlag, unknown)).toBe("pill");
      expect(resolveFlagValue(motionProfileFlag, unknown)).toBe("standard");
    }
  });
});

describe("normalizeFeatureFlags", () => {
  it("resolves each registered key from the raw row", () => {
    const flags = normalizeFeatureFlags({
      savedEventToastVariant: "toastAction",
      motionProfile: "snappy",
    });
    expect(flags).toEqual({
      savedEventToastVariant: "toastAction",
      motionProfile: "snappy",
    });
  });

  it("ignores unknown keys and retired flags, falling back to defaults", () => {
    const flags = normalizeFeatureFlags({
      notAFlag: "x",
      pinnedTickerIndicator: "badge",
      translucencyLevel: "strong",
      reorderDrag: "arrows",
      bottomNavVariant: "wide",
      wizardStepIndicator: "classic",
    });
    expect(flags).toEqual({
      savedEventToastVariant: "pill",
      motionProfile: "standard",
    });
  });
});

describe("isFeatureFlagKey", () => {
  it("accepts a live key and rejects retired or unknown keys", () => {
    expect(isFeatureFlagKey("savedEventToastVariant")).toBe(true);
    expect(isFeatureFlagKey("motionProfile")).toBe(true);
    expect(isFeatureFlagKey("pinnedTickerIndicator")).toBe(false);
    expect(isFeatureFlagKey("translucencyLevel")).toBe(false);
    expect(isFeatureFlagKey("reorderDrag")).toBe(false);
    expect(isFeatureFlagKey("bottomNavVariant")).toBe(false);
    expect(isFeatureFlagKey("wizardStepIndicator")).toBe(false);
    expect(isFeatureFlagKey("notAFlag")).toBe(false);
  });
});

describe("isReorderDragEnabled", () => {
  it("is true for the drag-handle modes", () => {
    expect(isReorderDragEnabled("drag")).toBe(true);
    expect(isReorderDragEnabled("arrowsDrag")).toBe(true);
    expect(isReorderDragEnabled("arrows")).toBe(false);
    expect(isReorderDragEnabled(undefined)).toBe(false);
  });
});

describe("isReorderArrowsEnabled", () => {
  it("is true for the chevron modes", () => {
    expect(isReorderArrowsEnabled("arrows")).toBe(true);
    expect(isReorderArrowsEnabled("arrowsDrag")).toBe(true);
    expect(isReorderArrowsEnabled("drag")).toBe(false);
    expect(isReorderArrowsEnabled(undefined)).toBe(false);
  });
});

describe("validateFeatureFlags", () => {
  it("accepts values within each flag's option set", () => {
    expect(
      validateFeatureFlags({
        savedEventToastVariant: "pillRestyle",
        motionProfile: "playful",
      }),
    ).toEqual({});
  });

  it("flags values outside the option set", () => {
    const errors = validateFeatureFlags({
      savedEventToastVariant: "fancy",
      motionProfile: "fancy",
    } as never);
    expect(errors.savedEventToastVariant).toBeTruthy();
    expect(errors.motionProfile).toBeTruthy();
  });
});
