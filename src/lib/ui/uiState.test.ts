import { describe, expect, it } from "vitest";

import {
  BASE_PAGES,
  SETTINGS_SUBTABS,
  UI_STATE_COOKIE,
  decodeUiState,
  encodeUiState,
  mergeUiState,
  normalizeUiState,
  resolveLaunchTarget,
} from "./uiState";

/** Buffer-based base64url for crafting raw cookie fixtures (no btoa needed). */
function b64url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

describe("encodeUiState/decodeUiState", () => {
  it("round-trips the device-local state", () => {
    const state = {
      lastPage: "/settings/users",
      sidebarCollapsed: true,
      dashboard: {
        date: "2026-08-21",
        month: "2026-08",
        zoom: 1.5,
        monthZoom: 2,
        dualSplit: 0.65,
      },
    };
    expect(decodeUiState(encodeUiState(state))).toEqual(state);
  });

  it("round-trips an empty state", () => {
    expect(decodeUiState(encodeUiState({}))).toEqual({});
  });

  it("is pure base64url (URL-safe alphabet, no padding)", () => {
    const value = encodeUiState({ lastPage: "/parade-state" });
    expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(value).not.toContain("=");
  });
});

describe("decodeUiState (garbage in, null out)", () => {
  it("treats absent/empty/undecodable values as null", () => {
    expect(decodeUiState(null)).toBeNull();
    expect(decodeUiState(undefined)).toBeNull();
    expect(decodeUiState("")).toBeNull();
    expect(decodeUiState("%%%")).toBeNull();
    expect(decodeUiState(b64url('"just a string"'))).toBeNull();
    expect(decodeUiState(b64url("[1,2,3]"))).toBeNull();
    expect(decodeUiState(b64url("42"))).toBeNull();
  });
});

describe("cookie versioning", () => {
  it("drops a legacy unversioned cookie", () => {
    expect(decodeUiState(b64url(JSON.stringify({ lastPage: "/dashboard" })))).toBeNull();
  });
  it("drops past and future majors", () => {
    const raw = (major: number) =>
      b64url(JSON.stringify({ v: [major, 0], lastPage: "/dashboard" }));
    expect(decodeUiState(raw(2))).toBeNull();
    expect(decodeUiState(raw(4))).toBeNull();
  });
  it("accepts a newer minor within the current major, dropping unknown fields", () => {
    const value = b64url(
      JSON.stringify({ v: [3, 9], lastPage: "/contacts", mystery: "x" }),
    );
    expect(decodeUiState(value)).toEqual({ lastPage: "/contacts" });
  });

  it("migrates a v3.0 cookie (no monthZoom) to the current shape", () => {
    const value = b64url(
      JSON.stringify({
        v: [3, 0],
        lastPage: "/dashboard",
        dashboard: { month: "2026-08", zoom: 1.5 },
      }),
    );
    expect(decodeUiState(value)).toEqual({
      lastPage: "/dashboard",
      dashboard: { month: "2026-08", zoom: 1.5 },
    });
  });

  it("migrates a v3.1 cookie (no dualSplit) to the current shape", () => {
    const value = b64url(
      JSON.stringify({
        v: [3, 1],
        lastPage: "/dashboard",
        dashboard: { month: "2026-08", monthZoom: 2 },
      }),
    );
    expect(decodeUiState(value)).toEqual({
      lastPage: "/dashboard",
      dashboard: { month: "2026-08", monthZoom: 2 },
    });
  });
});

describe("normalizeUiState (shape safety)", () => {
  it("drops the old per-view/per-device dashboard fields a v2 cookie carried", () => {
    const raw = normalizeUiState({
      v: [3, 0],
      lastPage: "/dashboard",
      sidebarCollapsed: true,
      dashboard: {
        view: "week",
        views: { month: { cal: ["c1"] } },
        pinnedViews: ["month"],
        filterMode: "per-view",
        cal: ["c1"],
        users: [],
        types: [],
        zoom: 1,
        date: "2026-08-21",
        month: "2026-08",
      },
      parade: { cal: ["c1"] },
    });
    expect(raw).toEqual({
      lastPage: "/dashboard",
      sidebarCollapsed: true,
      dashboard: { zoom: 1, date: "2026-08-21", month: "2026-08" },
    });
  });

  it("rejects non-plain-object input", () => {
    for (const value of [null, undefined, "x", 7, [1], true]) {
      expect(normalizeUiState(value)).toBeNull();
    }
  });

  it("keeps only absolute-path lastPage and real booleans", () => {
    expect(normalizeUiState({ lastPage: "https://evil.example" })).toEqual({});
    expect(normalizeUiState({ lastPage: "relative" })).toEqual({});
    expect(normalizeUiState({ lastPage: "/dashboard" })).toEqual({ lastPage: "/dashboard" });
    expect(normalizeUiState({ sidebarCollapsed: false })).toEqual({ sidebarCollapsed: false });
    expect(normalizeUiState({ sidebarCollapsed: "no" })).toEqual({});
  });

  it("snaps zoom to a known level and drops junk values", () => {
    const state = normalizeUiState({
      dashboard: { zoom: 99, date: "not-a-date", month: 42 },
    });
    // clampZoom caps at the max level; date is any non-empty string here (the
    // consuming page re-validates the pattern); a non-string month is dropped.
    expect(state).toEqual({ dashboard: { zoom: 2, date: "not-a-date" } });
  });

  it("snaps monthZoom to a known fit multiplier and drops junk values", () => {
    // A month zoom above 1 is remembered as-is; off-level or non-numeric
    // values snap to a level or degrade to the fit default (1).
    expect(
      normalizeUiState({ dashboard: { monthZoom: 2 } }),
    ).toEqual({ dashboard: { monthZoom: 2 } });
    expect(
      normalizeUiState({ dashboard: { monthZoom: 99 } }),
    ).toEqual({ dashboard: { monthZoom: 3 } });
    expect(
      normalizeUiState({ dashboard: { monthZoom: "2" } }),
    ).toEqual({});
    expect(
      normalizeUiState({ dashboard: { monthZoom: 1.4 } }),
    ).toEqual({ dashboard: { monthZoom: 1.5 } });
  });

  it("clamps dualSplit to the usable band and drops junk values", () => {
    expect(normalizeUiState({ dashboard: { dualSplit: 0.4 } })).toEqual({
      dashboard: { dualSplit: 0.4 },
    });
    expect(normalizeUiState({ dashboard: { dualSplit: 0.9 } })).toEqual({
      dashboard: { dualSplit: 0.75 },
    });
    expect(normalizeUiState({ dashboard: { dualSplit: 0.05 } })).toEqual({
      dashboard: { dualSplit: 0.25 },
    });
    expect(normalizeUiState({ dashboard: { dualSplit: "0.5" } })).toEqual({});
    expect(normalizeUiState({ dashboard: { dualSplit: Number.NaN } })).toEqual({});
  });
});

describe("mergeUiState", () => {
  it("merges patch-wins sections and leaves absent keys untouched", () => {
    const current = { lastPage: "/a", sidebarCollapsed: false, dashboard: { month: "2026-08" } };
    expect(mergeUiState(current, { dashboard: { zoom: 1.5 } })).toEqual({
      lastPage: "/a",
      sidebarCollapsed: false,
      dashboard: { zoom: 1.5 },
    });
    expect(mergeUiState({}, { sidebarCollapsed: true })).toEqual({ sidebarCollapsed: true });
  });
});

describe("resolveLaunchTarget", () => {
  it("falls back to /dashboard for unknown or missing last pages", () => {
    expect(resolveLaunchTarget(undefined, "user")).toBe("/dashboard");
    expect(resolveLaunchTarget("https://evil.example", "user")).toBe("/dashboard");
    expect(resolveLaunchTarget("/no-such-page", "user")).toBe("/dashboard");
  });
  it("keeps the three bottom-nav pages for both roles", () => {
    for (const page of BASE_PAGES) {
      expect(resolveLaunchTarget(page, "user")).toBe(page);
      expect(resolveLaunchTarget(page, "admin")).toBe(page);
    }
  });
  it("routes /settings by role", () => {
    expect(resolveLaunchTarget("/settings", "admin")).toBe("/settings/users");
    expect(resolveLaunchTarget("/settings", "user")).toBe("/dashboard");
  });
  it("scopes /settings sub-tabs to admins and known tabs", () => {
    expect(resolveLaunchTarget("/settings/users", "admin")).toBe("/settings/users");
    expect(resolveLaunchTarget("/settings/users", "user")).toBe("/dashboard");
    expect(resolveLaunchTarget("/settings/mystery", "admin")).toBe("/settings/users");
    expect(resolveLaunchTarget(SETTINGS_SUBTABS[0], "admin")).toBe(SETTINGS_SUBTABS[0]);
  });
});

describe("UI_STATE_COOKIE", () => {
  it("keeps the stable cookie name the shell + server share", () => {
    expect(UI_STATE_COOKIE).toBe("cloudy2.ui");
  });
});
