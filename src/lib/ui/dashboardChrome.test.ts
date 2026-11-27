import { describe, expect, it } from "vitest";

import { monthGridRows } from "@/lib/events/datetime";
import {
  COMPACT_CHROME_CHIP_CEILING,
  MAX_MONTH_GRID_ROWS,
  WIDE_DESKTOP_CHROME_RESERVE_PX,
  compactDesktopForHeight,
  projectedWideDayChips,
} from "./dashboardChrome";

describe("MAX_MONTH_GRID_ROWS", () => {
  it("is the real worst-case row count of the Month grid", () => {
    let seen = 0;
    for (const weekStart of ["monday", "sunday"] as const) {
      for (let year = 2024; year <= 2032; year += 1) {
        for (let month = 1; month <= 12; month += 1) {
          const key = `${year}-${String(month).padStart(2, "0")}`;
          const rows = monthGridRows(key, weekStart);
          expect(rows).toBeLessThanOrEqual(MAX_MONTH_GRID_ROWS);
          seen = Math.max(seen, rows);
        }
      }
    }
    // The constant is not a loose guess: some month actually renders six rows.
    expect(seen).toBe(MAX_MONTH_GRID_ROWS);
    // Aug 2026 under the Monday start: the 1st is a Saturday -> 5 + 31 days.
    expect(monthGridRows("2026-08", "monday")).toBe(MAX_MONTH_GRID_ROWS);
  });
});

describe("projectedWideDayChips", () => {
  it("projects the wide chrome's day-cell capacity from the viewport height", () => {
    // H = 700 -> 540px available, six rows -> 89px rows -> 37px chip area -> one chip.
    expect(projectedWideDayChips(700)).toBe(1);
    // A tall viewport caps at the four-chip legibility ceiling.
    expect(projectedWideDayChips(1200)).toBe(4);
  });

  it("is monotone in the row count, so the fix never narrows the compact tier", () => {
    // The module never projects a roomier month than the tightest one: a viewport
    // that compacts for the 6-row month compacts for every shape.
    for (const height of [640, 700, 740, 800, 850, 900, 1000]) {
      const tight = projectedWideDayChips(height, MAX_MONTH_GRID_ROWS);
      expect(tight).not.toBeNull();
      for (const rows of [4, 5]) {
        const roomy = projectedWideDayChips(height, rows);
        expect(roomy).not.toBeNull();
        expect(roomy as number).toBeGreaterThanOrEqual(tight as number);
      }
    }
  });

  it("returns null for an unmeasured or invalid viewport", () => {
    expect(projectedWideDayChips(0)).toBeNull();
    expect(projectedWideDayChips(-40)).toBeNull();
    expect(projectedWideDayChips(Number.NaN)).toBeNull();
    expect(projectedWideDayChips(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("compactDesktopForHeight", () => {
  // Row height at the compact boundary: the chip area (row - 52px) must stay
  // below three 21px slots. H < RESERVE + rows * (116) -> 856px at six rows.
  const boundary = WIDE_DESKTOP_CHROME_RESERVE_PX + MAX_MONTH_GRID_ROWS * (52 + 3 * 21 + 1);

  it("engages a step before the wide layout loses its third chip", () => {
    expect(compactDesktopForHeight(boundary - 1)).toBe(true);
    expect(compactDesktopForHeight(boundary)).toBe(false);
    // Typical 768p-laptop inner heights are compact; tall windows are not.
    expect(compactDesktopForHeight(640)).toBe(true);
    expect(compactDesktopForHeight(700)).toBe(true);
    expect(compactDesktopForHeight(900)).toBe(false);
    expect(compactDesktopForHeight(1200)).toBe(false);
  });

  it("is viewport-only: the Feb 2027 four-row month no longer un-compacts", () => {
    // The regression this module fixes: at H = 700 a four-row month projected
    // three chips, so the old month-derived rule rendered the FULL desktop chrome
    // for February 2027 alone while every 5/6-row neighbour stayed compact.
    expect(projectedWideDayChips(700, 4)).toBeGreaterThan(COMPACT_CHROME_CHIP_CEILING);
    expect(compactDesktopForHeight(700)).toBe(true);
  });

  it("never compacts an unmeasured viewport (pre-hydration {0, 0})", () => {
    expect(compactDesktopForHeight(0)).toBe(false);
    expect(compactDesktopForHeight(Number.NaN)).toBe(false);
    expect(compactDesktopForHeight(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
