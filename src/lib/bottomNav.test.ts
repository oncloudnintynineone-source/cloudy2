import { describe, expect, it } from "vitest";

import { RAIL_ORDER, RAIL_TILE_WIDTHS } from "./bottomNav";

describe("RAIL_TILE_WIDTHS", () => {
  it("maps each flag option to its fixed tile width", () => {
    expect(RAIL_TILE_WIDTHS).toEqual({ wide: 96, medium: 84, tight: 72 });
  });

  it("every width keeps a full-size tap target alongside the 56px bar height", () => {
    for (const width of Object.values(RAIL_TILE_WIDTHS)) {
      expect(width >= 44).toBe(true);
    }
  });
});

describe("RAIL_ORDER", () => {
  it("keeps the original nav order for every role", () => {
    expect(RAIL_ORDER).toEqual([
      "/dashboard",
      "/parade-state",
      "/contacts",
      "/double-booking",
      "/my-events",
      "/kah-status",
      "/settings",
    ]);
  });

  it("has no duplicate hrefs", () => {
    expect(new Set(RAIL_ORDER).size).toBe(RAIL_ORDER.length);
  });
});
