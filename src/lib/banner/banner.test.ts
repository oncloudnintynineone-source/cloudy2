import { describe, expect, it } from "vitest";

import {
  BANNER_COLORS,
  BANNER_DEFAULT_COLOR,
  BANNER_HEIGHT_DEFAULT,
  BANNER_HEIGHT_PRESETS,
  bannerColorOption,
  formatBannerColorLabel,
  formatBannerHeightLabel,
  isBannerColor,
  normalizeBannerColor,
  normalizeBannerHeight,
  normalizeBannerText,
  validateBannerForm,
} from "./banner";

describe("isBannerColor", () => {
  it("accepts curated palette keys", () => {
    for (const option of BANNER_COLORS) {
      expect(isBannerColor(option.key)).toBe(true);
    }
  });

  it("rejects non-curated values", () => {
    expect(isBannerColor("chartreuse")).toBe(false);
    expect(isBannerColor("#ff0000")).toBe(false);
    expect(isBannerColor(null)).toBe(false);
    expect(isBannerColor(undefined)).toBe(false);
    expect(isBannerColor(42)).toBe(false);
  });
});

describe("normalizeBannerColor", () => {
  it("keeps a curated color", () => {
    expect(normalizeBannerColor("red")).toBe("red");
  });

  it("falls back to the default for unset or unknown colors", () => {
    expect(normalizeBannerColor("")).toBe(BANNER_DEFAULT_COLOR);
    expect(normalizeBannerColor("#ff0000")).toBe(BANNER_DEFAULT_COLOR);
    expect(normalizeBannerColor(null)).toBe(BANNER_DEFAULT_COLOR);
    expect(normalizeBannerColor(undefined)).toBe(BANNER_DEFAULT_COLOR);
  });
});

describe("bannerColorOption", () => {
  it("returns the matching option", () => {
    expect(bannerColorOption("accent").label).toBe("Amber");
    expect(bannerColorOption("accent").textColor).toBe("dark");
  });

  it("falls back to the first entry for unknown keys", () => {
    expect(bannerColorOption("chartreuse" as never)).toEqual(BANNER_COLORS[0]);
  });
});

describe("formatBannerColorLabel", () => {
  it("labels a curated color", () => {
    expect(formatBannerColorLabel("green")).toBe("Green");
  });

  it("labels the default with a suffix when unset or unknown", () => {
    expect(formatBannerColorLabel(null)).toMatch(/\(default\)$/);
    expect(formatBannerColorLabel("#123456")).toMatch(/\(default\)$/);
  });
});

describe("normalizeBannerText", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeBannerText("  Out of camp tomorrow  ")).toBe("Out of camp tomorrow");
  });

  it("returns null for empty text", () => {
    expect(normalizeBannerText("")).toBeNull();
    expect(normalizeBannerText("   ")).toBeNull();
  });
});

describe("normalizeBannerHeight", () => {
  it("keeps an exact preset value", () => {
    for (const preset of BANNER_HEIGHT_PRESETS) {
      expect(normalizeBannerHeight(preset.px)).toBe(preset.px);
    }
  });

  it("snaps to the nearest preset", () => {
    expect(normalizeBannerHeight(30)).toBe(28);
    expect(normalizeBannerHeight(43)).toBe(48);
    expect(normalizeBannerHeight(60)).toBe(64);
  });

  it("keeps the lower preset on an exact tie", () => {
    expect(normalizeBannerHeight(42)).toBe(36);
  });

  it("clamps below-minimum values to the shortest preset", () => {
    expect(normalizeBannerHeight(4)).toBe(28);
    expect(normalizeBannerHeight(0)).toBe(28);
  });

  it("clamps above-maximum values to the tallest preset", () => {
    expect(normalizeBannerHeight(500)).toBe(64);
  });

  it("falls back to the default for non-numeric input", () => {
    expect(normalizeBannerHeight(null)).toBe(BANNER_HEIGHT_DEFAULT);
    expect(normalizeBannerHeight(undefined)).toBe(BANNER_HEIGHT_DEFAULT);
    expect(normalizeBannerHeight("nope")).toBe(BANNER_HEIGHT_DEFAULT);
    expect(normalizeBannerHeight(NaN)).toBe(BANNER_HEIGHT_DEFAULT);
  });
});

describe("formatBannerHeightLabel", () => {
  it("labels a curated preset", () => {
    expect(formatBannerHeightLabel(48)).toBe("Tall (48px)");
  });

  it("labels unknown values with the raw px", () => {
    expect(formatBannerHeightLabel(42)).toBe("42px");
  });

  it("defaults when unset", () => {
    expect(formatBannerHeightLabel(null)).toBe("36px");
  });
});

describe("validateBannerForm", () => {
  // Height is preset-driven and needs no validation, so a fixed preset here.
  const base = { color: "brand", height: 36 };

  it("requires text when enabled", () => {
    const errors = validateBannerForm({ ...base, enabled: true, text: "   " });
    expect(errors.text).toBe("Banner text is required");
  });

  it("allows empty text when disabled (config is kept)", () => {
    const errors = validateBannerForm({ ...base, enabled: false, text: "" });
    expect(errors).toEqual({});
  });

  it("flags text over the length cap in either state", () => {
    const long = "x".repeat(201);
    expect(validateBannerForm({ ...base, enabled: true, text: long }).text).toBeDefined();
    expect(validateBannerForm({ ...base, enabled: false, text: long }).text).toBeDefined();
  });

  it("accepts a valid enabled form", () => {
    const errors = validateBannerForm({
      ...base,
      enabled: true,
      text: "Water parade at 0800",
    });
    expect(errors).toEqual({});
  });
});
