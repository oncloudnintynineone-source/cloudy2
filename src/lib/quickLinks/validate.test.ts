import { describe, expect, it } from "vitest";

import {
  normalizeQuickLinkForm,
  normalizeQuickLinkLabel,
  normalizeQuickLinkUrl,
  validateQuickLinkForm,
  type QuickLinkFormValues,
} from "./validate";

function values(overrides: Partial<QuickLinkFormValues> = {}): QuickLinkFormValues {
  return {
    label: "Leave request",
    url: "https://apps.example.com/leave",
    icon: "clock",
    color: "",
    enabled: true,
    ...overrides,
  };
}

describe("normalizeQuickLinkLabel", () => {
  it("trims and returns the label", () => {
    expect(normalizeQuickLinkLabel("  Leave request ")).toBe("Leave request");
  });

  it("returns null when missing or over the cap", () => {
    expect(normalizeQuickLinkLabel("   ")).toBeNull();
    expect(normalizeQuickLinkLabel("x".repeat(41))).toBeNull();
    expect(normalizeQuickLinkLabel("x".repeat(40))).toBe("x".repeat(40));
  });
});

describe("normalizeQuickLinkUrl", () => {
  it("returns an empty string for a blank URL", () => {
    expect(normalizeQuickLinkUrl("  ")).toBe("");
  });

  it("accepts http(s) URLs", () => {
    expect(normalizeQuickLinkUrl("http://example.com")).toBe("http://example.com");
    expect(normalizeQuickLinkUrl(" https://example.com/a?b=c ")).toBe("https://example.com/a?b=c");
  });

  it("rejects other schemes and malformed URLs", () => {
    expect(normalizeQuickLinkUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeQuickLinkUrl("ftp://example.com")).toBeNull();
    expect(normalizeQuickLinkUrl("not a url")).toBeNull();
    expect(normalizeQuickLinkUrl("x".repeat(2049))).toBeNull();
  });
});

describe("validateQuickLinkForm", () => {
  it("accepts a valid form", () => {
    expect(validateQuickLinkForm(values())).toEqual({});
  });

  it("flags a missing label", () => {
    const errors = validateQuickLinkForm(values({ label: "  " }));
    expect(errors.label).toBe("Label is required");
  });

  it("flags an over-length label", () => {
    const errors = validateQuickLinkForm(values({ label: "x".repeat(41) }));
    expect(errors.label).toBe("Label must be 40 characters or fewer");
  });

  it("flags a missing URL", () => {
    const errors = validateQuickLinkForm(values({ url: "" }));
    expect(errors.url).toBe("URL is required");
  });

  it("flags non-http(s) and malformed URLs", () => {
    expect(validateQuickLinkForm(values({ url: "javascript:alert(1)" })).url).toBe(
      "URL must start with http:// or https://",
    );
    expect(validateQuickLinkForm(values({ url: "not a url" })).url).toBe("Enter a valid URL");
  });

  it("flags an over-length URL", () => {
    const errors = validateQuickLinkForm(values({ url: `https://example.com/${"x".repeat(2100)}` }));
    expect(errors.url).toBe("URL must be 2048 characters or fewer");
  });
});

describe("normalizeQuickLinkForm", () => {
  it("normalizes a valid form, defaulting icon and clearing auto color", () => {
    const result = normalizeQuickLinkForm(values({ icon: "bogus", color: "blue" }));
    expect(result).toEqual({
      ok: true,
      values: {
        label: "Leave request",
        url: "https://apps.example.com/leave",
        icon: "external-link",
        color: "blue",
      },
    });
  });

  it("maps an unknown or auto color to null", () => {
    expect(normalizeQuickLinkForm(values({ color: "bogus" })).values?.color).toBeNull();
    expect(normalizeQuickLinkForm(values({ color: "" })).values?.color).toBeNull();
  });

  it("returns label/url errors with the field", () => {
    expect(normalizeQuickLinkForm(values({ label: "" }))).toMatchObject({
      ok: false,
      field: "label",
    });
    expect(normalizeQuickLinkForm(values({ url: "nope" }))).toMatchObject({
      ok: false,
      field: "url",
      error: "Enter a valid http(s) URL",
    });
  });
});
