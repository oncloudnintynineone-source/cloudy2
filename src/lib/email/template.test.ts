import { describe, expect, it } from "vitest";

import { renderTemplate } from "./template";

describe("renderTemplate", () => {
  it("substitutes tokens case-insensitively and trims the token name", () => {
    expect(renderTemplate("{NAME} / { name } / {Name}", { name: "Ada" })).toBe("Ada / Ada / Ada");
  });

  it("leaves unknown tokens literal", () => {
    expect(renderTemplate("hi {nope} {name}", { name: "Ada" })).toBe("hi {nope} Ada");
  });

  it("renders an empty string for a present-but-empty token", () => {
    expect(renderTemplate("[{name}]", { name: "" })).toBe("[]");
  });

  it("leaves non-brace text and lone braces untouched", () => {
    expect(renderTemplate("a { b } c", {})).toBe("a { b } c");
  });
});
