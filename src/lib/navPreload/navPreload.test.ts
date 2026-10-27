import { describe, expect, it } from "vitest";

import { NAV_PRELOAD_HREFS, navPreloadSignature, planNavPreload } from "./navPreload";

describe("navPreloadSignature", () => {
  it("keys one pass per signed-in user", () => {
    expect(navPreloadSignature("u1")).toBe("u1::session");
  });
});

describe("planNavPreload", () => {
  it("plans the first pass for a signature", () => {
    expect(planNavPreload(new Set(), "u1::session")).toBe("u1::session");
  });

  it("skips a signature already covered this session", () => {
    expect(planNavPreload(new Set(["u1::session"]), "u1::session")).toBeNull();
  });

  it("plans for a different user on the same device", () => {
    const seen = new Set(["u1::session"]);
    expect(planNavPreload(seen, "u2::session")).toBe("u2::session");
  });

  it("covers exactly the three idle-warmed nav pages", () => {
    expect(NAV_PRELOAD_HREFS).toEqual(["/parade-state", "/contacts", "/double-booking"]);
  });
});
