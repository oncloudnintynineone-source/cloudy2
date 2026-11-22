import { describe, expect, it } from "vitest";

import { PILL_CIRCLE, PILL_MIN_VISIBLE_ACTIONS, pillActionsMin } from "./controlPill";

describe("pillActionsMin", () => {
  it("is the calendar pill's 128px floor for three 36px circles", () => {
    expect(pillActionsMin(PILL_CIRCLE.calendar)).toBe(
      "calc(3 * 36px + 2 * var(--mantine-spacing-xs))",
    );
  });

  it("grows with the 44px list-page circles", () => {
    expect(pillActionsMin(PILL_CIRCLE.list)).toBe(
      "calc(3 * 44px + 2 * var(--mantine-spacing-xs))",
    );
  });

  it("shrinks with the circle count so a short run never wraps early", () => {
    expect(pillActionsMin(PILL_CIRCLE.list, 2)).toBe(
      "calc(2 * 44px + 1 * var(--mantine-spacing-xs))",
    );
    expect(pillActionsMin(PILL_CIRCLE.list, 1)).toBe(
      "calc(1 * 44px + 0 * var(--mantine-spacing-xs))",
    );
  });

  it("always keeps at least one circle on the line", () => {
    expect(pillActionsMin(PILL_CIRCLE.calendar, 0)).toBe(
      "calc(1 * 36px + 0 * var(--mantine-spacing-xs))",
    );
    expect(pillActionsMin(PILL_CIRCLE.calendar, -4)).toBe(
      "calc(1 * 36px + 0 * var(--mantine-spacing-xs))",
    );
  });

  it("floors a fractional count", () => {
    expect(pillActionsMin(PILL_CIRCLE.calendar, 2.9)).toBe(
      "calc(2 * 36px + 1 * var(--mantine-spacing-xs))",
    );
  });

  it("defaults to the shared minimum-visible count", () => {
    expect(PILL_MIN_VISIBLE_ACTIONS).toBe(3);
  });
});
