import { describe, expect, it } from "vitest";

import { classifyLogin, parseUserLogin } from "./login";

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
});

describe("classifyLogin", () => {
  it("classifies keyword-suffixed input as user", () => {
    expect(classifyLogin("91234567leave", "leave", true)).toBe("user");
  });

  it("classifies non-keyword input as admin when an admin password exists", () => {
    expect(classifyLogin("secret", "leave", true)).toBe("admin");
  });

  it("returns unknown for empty input", () => {
    expect(classifyLogin("   ", "leave", true)).toBe("unknown");
  });

  it("returns unknown when nothing can disambiguate", () => {
    expect(classifyLogin("secret", "", false)).toBe("unknown");
  });
});
