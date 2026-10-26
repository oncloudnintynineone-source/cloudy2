import { describe, expect, it } from "vitest";

import {
  NAV_PRELOAD_HREFS,
  monthKeyOf,
  navPreloadSignature,
  planNavPreload,
} from "./navPreload";

describe("monthKeyOf", () => {
  it("formats the anchor month as YYYY-MM", () => {
    expect(monthKeyOf(new Date(2026, 9, 26))).toBe("2026-10");
    expect(monthKeyOf(new Date(2026, 0, 1))).toBe("2026-01");
  });
});

describe("navPreloadSignature", () => {
  it("keys one pass by user and anchor month", () => {
    expect(navPreloadSignature("u1", "2026-10")).toBe("u1::2026-10");
  });
});

describe("planNavPreload", () => {
  it("plans the first pass for a signature", () => {
    expect(planNavPreload(new Set(), "u1::2026-10")).toBe("u1::2026-10");
  });

  it("skips a signature already covered this session", () => {
    expect(planNavPreload(new Set(["u1::2026-10"]), "u1::2026-10")).toBeNull();
  });

  it("re-plans when the anchor month changes", () => {
    const seen = new Set(["u1::2026-10"]);
    expect(planNavPreload(seen, "u1::2026-11")).toBe("u1::2026-11");
  });

  it("re-plans for a different user on the same device", () => {
    const seen = new Set(["u1::2026-10"]);
    expect(planNavPreload(seen, "u2::2026-10")).toBe("u2::2026-10");
  });

  it("covers exactly the three idle-warmed nav pages", () => {
    expect(NAV_PRELOAD_HREFS).toEqual(["/parade-state", "/contacts", "/double-booking"]);
  });
});
