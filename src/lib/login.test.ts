import { describe, expect, it } from "vitest";

import { normalizePhoneDigits, parseUserLogin } from "./login";

describe("parseUserLogin", () => {
  it("strips the keyword and returns the last 8 digits", () => {
    expect(parseUserLogin("91234567leave", "leave")).toBe("91234567");
  });

  it("normalizes extra country code down to 8 digits", () => {
    expect(parseUserLogin("+6591234567leave", "leave")).toBe("91234567");
  });

  it("returns null when input does not end with the keyword", () => {
    expect(parseUserLogin("91234567", "leave")).toBeNull();
  });

  it("returns null for empty keyword or input", () => {
    expect(parseUserLogin("91234567leave", "")).toBeNull();
    expect(parseUserLogin("", "leave")).toBeNull();
  });

  it("returns null when fewer than 8 digits precede the keyword", () => {
    expect(parseUserLogin("1234567leave", "leave")).toBeNull();
  });
});

describe("normalizePhoneDigits", () => {
  it("keeps an 8-digit phone as-is", () => {
    expect(normalizePhoneDigits("91234567")).toBe("91234567");
  });

  it("drops spaces and punctuation", () => {
    expect(normalizePhoneDigits("9123 4567")).toBe("91234567");
    expect(normalizePhoneDigits("(9123) 456-7")).toBe("91234567");
  });

  it("reduces a country code down to the trailing 8 digits", () => {
    expect(normalizePhoneDigits("+6591234567")).toBe("91234567");
  });

  it("returns null for blank input", () => {
    expect(normalizePhoneDigits("")).toBeNull();
    expect(normalizePhoneDigits("   ")).toBeNull();
  });

  it("returns null when fewer than 8 digits are present", () => {
    expect(normalizePhoneDigits("abc1234567")).toBeNull();
  });
});
