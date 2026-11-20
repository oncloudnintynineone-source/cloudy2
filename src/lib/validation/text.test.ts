import { describe, expect, it } from "vitest";

import { trimToMax, validateRequiredText } from "./text";

describe("trimToMax", () => {
  it("trims and returns a valid value", () => {
    expect(trimToMax("  Ops  ", 10)).toBe("Ops");
  });

  it("returns null for blank or over-length values", () => {
    expect(trimToMax("  ", 10)).toBeNull();
    expect(trimToMax("abcdefghijk", 10)).toBeNull();
  });

  it("accepts a value exactly at the cap", () => {
    expect(trimToMax("abcdefghij", 10)).toBe("abcdefghij");
  });
});

describe("validateRequiredText", () => {
  const messages = { requiredMessage: "Required", maxMessage: "Too long" };

  it("returns the required message for blank input", () => {
    expect(validateRequiredText("  ", 10, messages)).toBe("Required");
  });

  it("returns the max message above the cap", () => {
    expect(validateRequiredText("abcdefghijk", 10, messages)).toBe("Too long");
  });

  it("returns undefined for a valid value", () => {
    expect(validateRequiredText(" Ops ", 10, messages)).toBeUndefined();
  });
});
