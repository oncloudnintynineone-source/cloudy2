import { describe, expect, it } from "vitest";

import {
  scaleFromRect,
  smModalContentWidth,
  transformOriginFromRect,
} from "./origin";

const viewport = { w: 390, h: 844 };

describe("transformOriginFromRect", () => {
  it("pins the origin to the rect center relative to a centered modal", () => {
    // Viewport 390x844 → center (195, 422). A chip centered on-screen maps to
    // the content center (50% 50%).
    const centerChip = { left: 145, top: 400, width: 100, height: 44 };
    expect(transformOriginFromRect(centerChip, viewport)).toBe(
      "calc(50% + 0px) calc(50% + 0px)",
    );
  });

  it("offsets from the viewport center for off-center targets", () => {
    // Chip near the top-right: center (350, 60) → offsets +155, -362.
    const chip = { left: 300, top: 40, width: 100, height: 40 };
    expect(transformOriginFromRect(chip, viewport)).toBe(
      "calc(50% + 155px) calc(50% + -362px)",
    );
  });

  it("returns the fallback when no rect is available", () => {
    expect(transformOriginFromRect(null, viewport, "bottom right")).toBe("bottom right");
    expect(transformOriginFromRect(null, viewport)).toBe("center");
  });
});

describe("smModalContentWidth", () => {
  it("caps at 380px for wide viewports", () => {
    expect(smModalContentWidth({ w: 1200, h: 800 })).toBe(380);
  });

  it("uses 90% of a narrow phone viewport", () => {
    expect(smModalContentWidth(viewport)).toBe(351);
  });
});

describe("scaleFromRect", () => {
  it("returns the fallback when no rect is available", () => {
    expect(scaleFromRect(null, 351, 0.5)).toBe(0.5);
  });

  it("collapses a small chip into a small scale", () => {
    const chip = { left: 0, top: 0, width: 80, height: 18 };
    expect(scaleFromRect(chip, 351)).toBe(0.12);
  });

  it("never exceeds the max scale", () => {
    const wide = { left: 0, top: 0, width: 351, height: 351 };
    expect(scaleFromRect(wide, 351)).toBe(0.6);
  });

  it("respects a custom max", () => {
    const wide = { left: 0, top: 0, width: 351, height: 351 };
    expect(scaleFromRect(wide, 351, 0.3, 0.12, 0.4)).toBe(0.4);
  });
});
