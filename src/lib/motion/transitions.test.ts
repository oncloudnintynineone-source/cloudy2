import { describe, expect, it } from "vitest";

import { resolveMotion } from "./profile";
import {
  fadeTransitionProps,
  modalFormTransitionProps,
  modalZoomTransitionProps,
  popoverTransitionProps,
} from "./transitions";

const playful = resolveMotion("playful");
const standard = resolveMotion("standard");
const calm = resolveMotion("calm");

describe("modal transitions", () => {
  it("bounces the zoom modal in and exits without overshoot", () => {
    const props = modalZoomTransitionProps(playful, null, { w: 1000, h: 800 }, 600);
    expect(props.transition.in.transitionTimingFunction).toBe(playful.easing.pop);
    expect(props.transition.out.transitionTimingFunction).toBe(playful.easing.out);
    expect(props.timingFunction).toBe(playful.easing.out);
    expect(props.transition.out.transform).toMatch(/^scale\(/);
  });

  it("applies the same split to the full form modal", () => {
    const props = modalFormTransitionProps(playful, null, { w: 1000, h: 800 }, 600);
    expect(props.transition.in.transitionTimingFunction).toBe(playful.easing.pop);
    expect(props.transition.out.transitionTimingFunction).toBe(playful.easing.out);
  });

  it("gives plain dialogs a playful scale pop", () => {
    const props = fadeTransitionProps(playful);
    expect(props.transition.in.transitionTimingFunction).toBe(playful.easing.pop);
    expect(props.transition.out.transitionTimingFunction).toBe(playful.easing.out);
    expect(props.transition.out.transform).toBe("scale(0.82)");
  });

  it("keeps the standard dialog start shallower than playful", () => {
    expect(fadeTransitionProps(standard).transition.out.transform).toBe("scale(0.94)");
  });

  it("has no overshoot under calm", () => {
    expect(calm.easing.pop).toBe("cubic-bezier(0.34, 1, 0.64, 1)");
  });
});

describe("popover transitions", () => {
  it("bounces the enter and keeps the exit on the out curve", () => {
    const props = popoverTransitionProps(playful);
    expect(props.transition.in.transitionTimingFunction).toBe(playful.easing.pop);
    expect(props.transition.out.transitionTimingFunction).toBe(playful.easing.out);
    expect(props.transition.out.transform).toContain(`translateY(${playful.distance.sm}px)`);
  });
});
