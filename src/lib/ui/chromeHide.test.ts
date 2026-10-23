import { describe, expect, it } from "vitest";

import {
  advanceChromeHide,
  initialChromeHideState,
  type ChromeHideEvent,
  type ChromeHideState,
} from "./chromeHide";

function apply(state: ChromeHideState, ...events: ChromeHideEvent[]): ChromeHideState {
  return events.reduce((s, e) => advanceChromeHide(s, e), state);
}

const fresh = () => initialChromeHideState();

describe("advanceChromeHide", () => {
  it("hides on a touch-down in the pane, even without any scroll", () => {
    expect(advanceChromeHide(fresh(), { type: "touch-down" }).hidden).toBe(true);
  });

  it("hides on a mouse/pen pointer-down in the pane", () => {
    const s = advanceChromeHide(fresh(), { type: "pointer-down" });
    expect(s.hidden).toBe(true);
    expect(s.otherPointers).toBe(1);
  });

  it("hides on any scroll", () => {
    expect(advanceChromeHide(fresh(), { type: "scroll" }).hidden).toBe(true);
  });

  it("the reported bug: a settled scroll does NOT reveal while a finger is down", () => {
    // Touch the pane, scroll (the browser fires pointercancel — ignored here),
    // the scroll settles, but the finger has not lifted (touchPoints still 1).
    const s = apply(
      fresh(),
      { type: "touch-down" },
      { type: "touch-count", count: 1 },
      { type: "scroll" },
      { type: "scroll-settled" },
    );
    expect(s.hidden).toBe(true);
    // Only the touchend (count 0) reveals.
    expect(advanceChromeHide(s, { type: "touch-count", count: 0 }).hidden).toBe(false);
  });

  it("touchend (count 0) after the scroll settles reveals the chrome", () => {
    const s = apply(
      fresh(),
      { type: "touch-down" },
      { type: "touch-count", count: 1 },
      { type: "scroll" },
      { type: "touch-count", count: 0 }, // finger lifted, momentum still running
      { type: "scroll-settled" },
    );
    expect(s.hidden).toBe(false);
  });

  it("a hold-still (touch, no scroll) stays hidden until the finger lifts", () => {
    const s = apply(fresh(), { type: "touch-down" }, { type: "touch-count", count: 1 });
    expect(s.hidden).toBe(true);
    expect(advanceChromeHide(s, { type: "touch-count", count: 0 }).hidden).toBe(false);
  });

  it("touch-canceled leaves the finger count unchanged (finger may still be down)", () => {
    const s = apply(fresh(), { type: "touch-down" }, { type: "touch-count", count: 1 });
    const after = advanceChromeHide(s, { type: "touch-canceled" });
    expect(after).toBe(s); // no change at all
    expect(after.touchPoints).toBe(1);
    expect(after.hidden).toBe(true);
  });

  it("tracks multi-touch: two fingers down, one lifts (still hidden), last lifts (reveal)", () => {
    const one = apply(fresh(), { type: "touch-down" }, { type: "touch-count", count: 2 });
    const second = advanceChromeHide(one, { type: "touch-count", count: 1 });
    expect(second.hidden).toBe(true);
    expect(second.touchPoints).toBe(1);
    const last = advanceChromeHide(second, { type: "touch-count", count: 0 });
    expect(last.hidden).toBe(false);
  });

  it("mouse: reveals once the pointer lifts and scrolling has settled", () => {
    const s = apply(
      fresh(),
      { type: "pointer-down" },
      { type: "scroll" },
      { type: "pointer-up" }, // lifted, momentum still running
    );
    expect(s.hidden).toBe(true);
    expect(advanceChromeHide(s, { type: "scroll-settled" }).hidden).toBe(false);
  });

  it("clamps the mouse/pen pointer count at zero (a stray release cannot go negative)", () => {
    const s = advanceChromeHide(fresh(), { type: "pointer-up" });
    expect(s.otherPointers).toBe(0);
    expect(s.hidden).toBe(false);
  });

  it("a redundant scroll frame while already hidden+scrolling is a no-op", () => {
    const s = advanceChromeHide(fresh(), { type: "scroll" });
    expect(advanceChromeHide(s, { type: "scroll" })).toBe(s);
  });

  it("a no-op touch-down while already hidden returns the same reference", () => {
    const s = advanceChromeHide(fresh(), { type: "touch-down" });
    expect(advanceChromeHide(s, { type: "touch-down" })).toBe(s);
  });

  it("reset forces the chrome back even mid-interaction", () => {
    const s = apply(
      fresh(),
      { type: "touch-down" },
      { type: "touch-count", count: 1 },
      { type: "scroll" },
      { type: "reset" },
    );
    expect(s.hidden).toBe(false);
    expect(s.touchPoints).toBe(0);
    expect(s.otherPointers).toBe(0);
    expect(s.scrolling).toBe(false);
  });

  it("a no-op reset while already idle returns the same reference", () => {
    const s = fresh();
    expect(advanceChromeHide(s, { type: "reset" })).toBe(s);
  });
});
