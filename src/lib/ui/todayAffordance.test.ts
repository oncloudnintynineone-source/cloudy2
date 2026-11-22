import { describe, expect, it } from "vitest";

import { isOffToday } from "./todayAffordance";

// 2026-11-22 is a Sunday; its Monday-start week is 2026-11-16 … 2026-11-22.
const TODAY = "2026-11-22";

describe("isOffToday — month", () => {
  it("hides the affordance while the shown month contains today", () => {
    expect(isOffToday({ kind: "month", month: "2026-11" }, TODAY)).toBe(false);
  });

  it("shows it for an adjacent or next-year month", () => {
    expect(isOffToday({ kind: "month", month: "2026-12" }, TODAY)).toBe(true);
    expect(isOffToday({ kind: "month", month: "2025-11" }, TODAY)).toBe(true);
  });
});

describe("isOffToday — week", () => {
  it("hides it while the shown week merely contains today (both edges)", () => {
    // Mid-week anchor, today is the week's last day (Sunday, Monday start).
    expect(isOffToday({ kind: "week", date: "2026-11-18", weekStartsOn: "monday" }, TODAY)).toBe(
      false,
    );
    // Today is the week's first day.
    expect(isOffToday({ kind: "week", date: "2026-11-16", weekStartsOn: "monday" }, TODAY)).toBe(
      false,
    );
  });

  it("shows it once the week has passed today entirely", () => {
    expect(isOffToday({ kind: "week", date: "2026-11-23", weekStartsOn: "monday" }, TODAY)).toBe(
      true,
    );
  });

  it("keeps a month-spanning week on-today when today is inside it", () => {
    // 2026-11-01 is a Sunday; its Monday-start week starts in October.
    expect(isOffToday({ kind: "week", date: "2026-11-01", weekStartsOn: "monday" }, "2026-11-01")).toBe(
      false,
    );
  });

  it("follows the account's weekStartsOn", () => {
    // Sunday-start, the week of 2026-11-23 runs 2026-11-22 … 2026-11-28, so
    // today is inside it — while the Monday-start week (23 … 29) excludes it.
    expect(isOffToday({ kind: "week", date: "2026-11-23", weekStartsOn: "sunday" }, TODAY)).toBe(
      false,
    );
    expect(isOffToday({ kind: "week", date: "2026-11-23", weekStartsOn: "monday" }, TODAY)).toBe(
      true,
    );
  });
});

describe("isOffToday — day", () => {
  it("hides it on today and shows it on any other day", () => {
    expect(isOffToday({ kind: "day", date: TODAY }, TODAY)).toBe(false);
    expect(isOffToday({ kind: "day", date: "2026-11-23" }, TODAY)).toBe(true);
  });
});
