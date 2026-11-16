import { describe, expect, it } from "vitest";

import {
  WIDGET_TOKEN_LABEL_DEFAULT,
  WIDGET_TOKEN_LABEL_MAX_LENGTH,
  WIDGET_TOKEN_PREFIX,
  generateWidgetToken,
  hashWidgetToken,
  parseWidgetToken,
  sanitizeWidgetTokenLabel,
  widgetTokenPrefix,
} from "./tokens";

describe("generateWidgetToken", () => {
  it("creates a prefixed, well-formed, unique token", () => {
    const first = generateWidgetToken();
    const second = generateWidgetToken();
    expect(first).not.toBe(second);
    expect(first.startsWith(WIDGET_TOKEN_PREFIX)).toBe(true);
    expect(parseWidgetToken(first)).toBe(first);
  });
});

describe("hashWidgetToken", () => {
  it("is deterministic and hides the plaintext", () => {
    const token = "c2w_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";
    const hash = hashWidgetToken(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe(hashWidgetToken(token));
    expect(hash).not.toContain(token);
  });
});

describe("parseWidgetToken", () => {
  it("accepts a valid token with surrounding whitespace", () => {
    const token = generateWidgetToken();
    expect(parseWidgetToken(`  ${token}  `)).toBe(token);
  });

  it("rejects junk, wrong prefixes and wrong lengths", () => {
    for (const raw of [
      "",
      "   ",
      "c2w_short",
      `c2w_${"a".repeat(42)}`,
      `c2w_${"a".repeat(44)}`,
      `xyz_${"a".repeat(43)}`,
      `c2w_${"a".repeat(42)}!`,
      null,
      undefined,
    ]) {
      expect(parseWidgetToken(raw)).toBeNull();
    }
  });
});

describe("widgetTokenPrefix", () => {
  it("keeps only the leading characters", () => {
    const token = generateWidgetToken();
    expect(widgetTokenPrefix(token)).toHaveLength(12);
    expect(token.startsWith(widgetTokenPrefix(token))).toBe(true);
  });
});

describe("sanitizeWidgetTokenLabel", () => {
  it("trims and defaults a blank label", () => {
    expect(sanitizeWidgetTokenLabel("  Pixel 9  ")).toEqual({ ok: true, value: "Pixel 9" });
    expect(sanitizeWidgetTokenLabel("")).toEqual({
      ok: true,
      value: WIDGET_TOKEN_LABEL_DEFAULT,
    });
    expect(sanitizeWidgetTokenLabel(undefined)).toEqual({
      ok: true,
      value: WIDGET_TOKEN_LABEL_DEFAULT,
    });
  });

  it("rejects overlong labels and control characters", () => {
    expect(
      sanitizeWidgetTokenLabel("a".repeat(WIDGET_TOKEN_LABEL_MAX_LENGTH + 1)).ok,
    ).toBe(false);
    expect(sanitizeWidgetTokenLabel("bad\nlabel").ok).toBe(false);
  });
});
