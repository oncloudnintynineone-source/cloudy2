import { describe, expect, it } from "vitest";

import {
  normalizeWebhookName,
  normalizeWebhookSecret,
  normalizeWebhookUrl,
  validateWebhookForm,
} from "./validate";

describe("normalizeWebhookName", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeWebhookName("  Ops channel  ")).toBe("Ops channel");
  });

  it("returns null for a blank name", () => {
    expect(normalizeWebhookName("")).toBeNull();
    expect(normalizeWebhookName("   ")).toBeNull();
  });

  it("returns null for an over-long name", () => {
    expect(normalizeWebhookName("x".repeat(101))).toBeNull();
  });
});

describe("normalizeWebhookUrl", () => {
  it("returns an empty string for a blank URL", () => {
    expect(normalizeWebhookUrl("")).toBe("");
    expect(normalizeWebhookUrl("   ")).toBe("");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeWebhookUrl("  https://example.com/hook  ")).toBe("https://example.com/hook");
  });

  it("accepts http and https URLs", () => {
    expect(normalizeWebhookUrl("http://intranet.local/hook")).toBe("http://intranet.local/hook");
    expect(normalizeWebhookUrl("https://example.com/hook")).toBe("https://example.com/hook");
  });

  it("returns null for a non-URL value", () => {
    expect(normalizeWebhookUrl("not a url")).toBeNull();
  });

  it("returns null for unsupported protocols", () => {
    expect(normalizeWebhookUrl("ftp://example.com/hook")).toBeNull();
    expect(normalizeWebhookUrl("javascript:alert(1)")).toBeNull();
  });

  it("returns null for an over-long URL", () => {
    expect(normalizeWebhookUrl(`https://example.com/${"a".repeat(600)}`)).toBeNull();
  });
});

describe("normalizeWebhookSecret", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeWebhookSecret("  s3cret  ")).toBe("s3cret");
  });

  it("returns an empty string for blank input", () => {
    expect(normalizeWebhookSecret("")).toBe("");
  });

  it("returns null for an over-long secret", () => {
    expect(normalizeWebhookSecret("x".repeat(201))).toBeNull();
  });

  it("accepts a secret at the cap", () => {
    expect(normalizeWebhookSecret("x".repeat(200))).toBe("x".repeat(200));
  });
});

describe("validateWebhookForm", () => {
  const valid = { name: "Ops", url: "https://example.com/hook", secret: "s3cret", enabled: true };

  it("returns no errors for a valid configuration", () => {
    expect(validateWebhookForm(valid)).toEqual({});
  });

  it("flags a missing name", () => {
    expect(validateWebhookForm({ ...valid, name: "  " }).name).toBe("Name is required");
  });

  it("flags a missing URL", () => {
    expect(validateWebhookForm({ ...valid, url: "" }).url).toBe("URL is required");
  });

  it("flags an invalid URL", () => {
    expect(validateWebhookForm({ ...valid, url: "nope" }).url).toBe("Enter a valid URL");
  });

  it("flags a non-http(s) protocol", () => {
    expect(validateWebhookForm({ ...valid, url: "ftp://example.com" }).url).toBe(
      "URL must start with http:// or https://",
    );
  });

  it("allows an empty secret (unsigned deliveries)", () => {
    expect(validateWebhookForm({ ...valid, secret: "" })).toEqual({});
  });

  it("flags an over-long secret", () => {
    expect(
      validateWebhookForm({ ...valid, secret: "x".repeat(201) }).secret,
    ).toBe("Secret must be 200 characters or fewer");
  });
});
