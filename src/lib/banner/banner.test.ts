import { describe, expect, it } from "vitest";

import {
  BANNER_COLORS,
  BANNER_DEFAULT_COLOR,
  BANNER_HEIGHT_PX,
  BANNER_TEXT_MAX_LENGTH,
  bannerColorOption,
  formatBannerColorLabel,
  isBannerColor,
  normalizeBannerColor,
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

describe("BANNER_HEIGHT_PX", () => {
  it("is 25", () => {
    expect(BANNER_HEIGHT_PX).toBe(25);
  });
});

describe("validateBannerForm", () => {
  const base = { color: "brand" };

  it("requires text when enabled", () => {
    const errors = validateBannerForm({ ...base, enabled: true, text: "   " });
    expect(errors.text).toBe("Banner text is required");
  });

  it("allows empty text when disabled (config is kept)", () => {
    const errors = validateBannerForm({ ...base, enabled: false, text: "" });
    expect(errors).toEqual({});
  });

  it("flags text over the length cap in either state", () => {
    const long = "x".repeat(BANNER_TEXT_MAX_LENGTH + 1);
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
