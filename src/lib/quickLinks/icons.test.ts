import { describe, expect, it } from "vitest";

import {
  formatQuickLinkIconLabel,
  isQuickLinkIconKey,
  normalizeQuickLinkIcon,
} from "./icons";

describe("quick link icons", () => {
  it("accepts every curated key", () => {
    expect(isQuickLinkIconKey("external-link")).toBe(true);
    expect(isQuickLinkIconKey("qr-code")).toBe(true);
    expect(isQuickLinkIconKey("bookmark")).toBe(true);
  });

  it("rejects unknown keys and non-strings", () => {
    expect(isQuickLinkIconKey("nope")).toBe(false);
    expect(isQuickLinkIconKey("")).toBe(false);
    expect(isQuickLinkIconKey(null)).toBe(false);
    expect(isQuickLinkIconKey(42)).toBe(false);
  });

  it("normalizes unknown/missing values to the default icon", () => {
    expect(normalizeQuickLinkIcon("map-pin")).toBe("map-pin");
    expect(normalizeQuickLinkIcon("nope")).toBe("external-link");
    expect(normalizeQuickLinkIcon("")).toBe("external-link");
    expect(normalizeQuickLinkIcon(null)).toBe("external-link");
  });

  it("formats a human-readable label, falling back safely", () => {
    expect(formatQuickLinkIconLabel("qr-code")).toBe("QR code");
    expect(formatQuickLinkIconLabel("nope")).toBe("External link");
    expect(formatQuickLinkIconLabel(null)).toBe("External link");
  });
});
