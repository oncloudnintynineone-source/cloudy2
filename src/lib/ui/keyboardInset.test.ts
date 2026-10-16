import { describe, expect, it } from "vitest";

import {
  computeKeyboardInset,
  decideKeyboardLift,
  KEYBOARD_MIN_INSET_PX,
} from "./keyboardInset";

describe("computeKeyboardInset", () => {
  it("returns 0 when the visual viewport fills the layout viewport", () => {
    expect(computeKeyboardInset(800, 800, 0)).toBe(0);
  });

  it("returns the covered band for an iOS-style keyboard (layout viewport unchanged)", () => {
    expect(computeKeyboardInset(800, 800 - 300, 0)).toBe(300);
  });

  it("counts the visual viewport offsetTop against the covered band", () => {
    expect(computeKeyboardInset(800, 500, 60)).toBe(240);
  });

  it("returns 0 on Android where the layout viewport shrinks with the keyboard", () => {
    expect(computeKeyboardInset(800 - 300, 500, 0)).toBe(0);
  });

  it("ignores shrinkage below the keyboard threshold (iOS toolbar collapse)", () => {
    expect(computeKeyboardInset(800, 800 - (KEYBOARD_MIN_INSET_PX - 1), 0)).toBe(0);
    expect(computeKeyboardInset(800, 800 - KEYBOARD_MIN_INSET_PX, 0)).toBe(
      KEYBOARD_MIN_INSET_PX,
    );
  });

  it("never returns a negative inset", () => {
    expect(computeKeyboardInset(500, 800, 0)).toBe(0);
  });
});

describe("decideKeyboardLift", () => {
  it("schedules the measured inset while a keyboard is up", () => {
    expect(decideKeyboardLift(300)).toEqual({ kind: "schedule", inset: 300 });
  });

  it("clears the lift immediately when the keyboard is gone", () => {
    expect(decideKeyboardLift(0)).toEqual({ kind: "clear" });
  });

  it("clears on a non-positive raw inset", () => {
    expect(decideKeyboardLift(-10)).toEqual({ kind: "clear" });
  });
});
