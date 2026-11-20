import { describe, expect, it } from "vitest";

import { normalizeHttpUrl, validateHttpUrl } from "./url";

const messages = {
  tooLongMessage: "Too long",
  invalidMessage: "Invalid URL",
  protocolMessage: "Must be http(s)",
};

describe("normalizeHttpUrl", () => {
  it("returns an empty string for a blank value", () => {
    expect(normalizeHttpUrl("   ", 100)).toBe("");
  });

  it("trims and keeps a valid http(s) URL", () => {
    expect(normalizeHttpUrl("  https://example.com/hook  ", 100)).toBe("https://example.com/hook");
  });

  it("rejects a non-http scheme", () => {
    expect(normalizeHttpUrl("javascript:alert(1)", 100)).toBeNull();
    expect(normalizeHttpUrl("data:text/html,x", 100)).toBeNull();
  });

  it("rejects an over-length URL", () => {
    expect(normalizeHttpUrl(`https://example.com/${"a".repeat(20)}`, 10)).toBeNull();
  });

  it("rejects a malformed URL", () => {
    expect(normalizeHttpUrl("not a url", 100)).toBeNull();
  });
});

describe("validateHttpUrl", () => {
  it("returns undefined for a blank value (caller owns required)", () => {
    expect(validateHttpUrl("", 100, messages)).toBeUndefined();
  });

  it("returns undefined for a valid URL", () => {
    expect(validateHttpUrl("https://example.com", 100, messages)).toBeUndefined();
  });

  it("returns the too-long message before parsing", () => {
    expect(validateHttpUrl(`https://example.com/${"a".repeat(20)}`, 10, messages)).toBe(
      "Too long",
    );
  });

  it("maps a bad scheme to the protocol message", () => {
    expect(validateHttpUrl("javascript:alert(1)", 100, messages)).toBe("Must be http(s)");
  });

  it("maps a malformed URL to the invalid message", () => {
    expect(validateHttpUrl("not a url", 100, messages)).toBe("Invalid URL");
  });
});
