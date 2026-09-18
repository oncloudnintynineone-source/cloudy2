import { describe, expect, it } from "vitest";

import {
  FEATURE_FLAGS,
  isFeatureFlagKey,
  normalizeFeatureFlags,
  resolveFlagValue,
  validateFeatureFlags,
  pinnedTickerIndicatorFlag,
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
        expect(def.optionLabels[option]).toBeTruthy();
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
  });

  it("falls back to the default for unknown values", () => {
    for (const unknown of ["fancy", "", 42, null, undefined, {}]) {
      expect(resolveFlagValue(pinnedTickerIndicatorFlag, unknown)).toBe("classic");
    }
  });
});

describe("normalizeFeatureFlags", () => {
  it("resolves each registered key from the raw row", () => {
    const flags = normalizeFeatureFlags({ pinnedTickerIndicator: "badge" });
    expect(flags).toEqual({ pinnedTickerIndicator: "badge" });
  });

  it("ignores unknown keys and falls back to defaults", () => {
    const flags = normalizeFeatureFlags({ notAFlag: "x" });
    expect(flags).toEqual({ pinnedTickerIndicator: "classic" });
  });
});

describe("isFeatureFlagKey", () => {
  it("accepts a registered key and rejects others", () => {
    expect(isFeatureFlagKey("pinnedTickerIndicator")).toBe(true);
    expect(isFeatureFlagKey("notAFlag")).toBe(false);
  });
});

describe("validateFeatureFlags", () => {
  it("accepts values within each flag's option set", () => {
    expect(validateFeatureFlags({ pinnedTickerIndicator: "segmented" })).toEqual({});
  });

  it("flags values outside the option set", () => {
    const errors = validateFeatureFlags({ pinnedTickerIndicator: "fancy" } as never);
    expect(errors.pinnedTickerIndicator).toBeTruthy();
  });
});