import { describe, expect, it } from "vitest";

import {
  FEATURE_FLAGS,
  isFeatureFlagKey,
  isReorderArrowsEnabled,
  isReorderDragEnabled,
  normalizeFeatureFlags,
  resolveFlagValue,
  validateFeatureFlags,
  translucencyLevelFlag,
  pinnedTickerIndicatorFlag,
  reorderDragFlag,
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
});

describe("resolveFlagValue", () => {
  it("returns a valid stored value unchanged", () => {
    expect(resolveFlagValue(pinnedTickerIndicatorFlag, "segmented")).toBe("segmented");
    expect(resolveFlagValue(savedEventToastVariantFlag, "toastPlain")).toBe("toastPlain");
    expect(resolveFlagValue(translucencyLevelFlag, "strong")).toBe("strong");
    expect(resolveFlagValue(reorderDragFlag, "arrowsDrag")).toBe("arrowsDrag");
  });

  it("falls back to the default for unknown values", () => {
    for (const unknown of ["fancy", "", 42, null, undefined, {}]) {
      expect(resolveFlagValue(pinnedTickerIndicatorFlag, unknown)).toBe("classic");
      expect(resolveFlagValue(savedEventToastVariantFlag, unknown)).toBe("pill");
      expect(resolveFlagValue(translucencyLevelFlag, unknown)).toBe("medium");
      expect(resolveFlagValue(reorderDragFlag, unknown)).toBe("drag");
    }
  });
});

describe("normalizeFeatureFlags", () => {
  it("resolves each registered key from the raw row", () => {
    const flags = normalizeFeatureFlags({
      pinnedTickerIndicator: "badge",
      savedEventToastVariant: "toastAction",
    });
    expect(flags).toEqual({
      pinnedTickerIndicator: "badge",
      savedEventToastVariant: "toastAction",
      translucencyLevel: "medium",
      reorderDrag: "drag",
    });
  });

  it("ignores unknown keys and falls back to defaults", () => {
    const flags = normalizeFeatureFlags({ notAFlag: "x" });
    expect(flags).toEqual({
      pinnedTickerIndicator: "classic",
      savedEventToastVariant: "pill",
      translucencyLevel: "medium",
      reorderDrag: "drag",
    });
  });
});

describe("isFeatureFlagKey", () => {
  it("accepts a registered key and rejects others", () => {
    expect(isFeatureFlagKey("pinnedTickerIndicator")).toBe(true);
    expect(isFeatureFlagKey("savedEventToastVariant")).toBe(true);
    expect(isFeatureFlagKey("translucencyLevel")).toBe(true);
    expect(isFeatureFlagKey("reorderDrag")).toBe(true);
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
        pinnedTickerIndicator: "segmented",
        savedEventToastVariant: "pillRestyle",
        translucencyLevel: "strong",
        reorderDrag: "arrowsDrag",
      }),
    ).toEqual({});
  });

  it("flags values outside the option set", () => {
    const errors = validateFeatureFlags({
      pinnedTickerIndicator: "fancy",
      savedEventToastVariant: "fancy",
    } as never);
    expect(errors.pinnedTickerIndicator).toBeTruthy();
    expect(errors.savedEventToastVariant).toBeTruthy();
  });
});
