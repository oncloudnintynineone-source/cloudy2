import { describe, expect, it } from "vitest";

import {
  UI_STATE_COOKIE,
  decodeUiState,
  encodeUiState,
  freshMarkerNeeded,
  mergeUiState,
  normalizeUiState,
  resolveLaunchTarget,
} from "./uiState";

describe("encodeUiState/decodeUiState", () => {
  const state = {
    lastPage: "/settings/audit-log",
    dashboard: {
      view: "week",
      date: "2026-08-17",
      month: "2026-08",
      cal: ["a", "b"],
      users: ["u1"],
    },
    parade: { date: "2026-08-20", month: "2026-08" },
  };

  it("round-trips the full state", () => {
    expect(decodeUiState(encodeUiState(state))).toEqual(state);
  });

  it("round-trips an empty state", () => {
    expect(decodeUiState(encodeUiState({}))).toEqual({});
  });

  it("stays in the base64url alphabet (cookie-safe, no padding)", () => {
    const value = encodeUiState(state);
    expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(value).not.toContain("=");
  });

  it("decodes padded input (defensive)", () => {
    let padded = encodeUiState(state);
    while (padded.length % 4 !== 0) {
      padded += "=";
    }
    expect(decodeUiState(padded)).toEqual(state);
  });
});

describe("decodeUiState (garbage in, null out)", () => {
  it("returns null for missing/empty raw values", () => {
    expect(decodeUiState(null)).toBeNull();
    expect(decodeUiState(undefined)).toBeNull();
    expect(decodeUiState("")).toBeNull();
  });

  it("returns null for non-base64url or non-JSON values", () => {
    expect(decodeUiState("%%%")).toBeNull();
    expect(decodeUiState(toBase64Url("{\"broken\":"))).toBeNull();
  });

  it("returns null when the decoded JSON is not an object", () => {
    expect(decodeUiState(toBase64Url('"just a string"'))).toBeNull();
    expect(decodeUiState(toBase64Url("[1,2,3]"))).toBeNull();
    expect(decodeUiState(toBase64Url("42"))).toBeNull();
  });
});

describe("normalizeUiState", () => {
  it("keeps well-formed fields", () => {
    expect(
      normalizeUiState({
        lastPage: "/contacts",
        dashboard: { view: "agenda", cal: ["x"] },
        parade: { users: ["u"] },
      }),
    ).toEqual({
      lastPage: "/contacts",
      dashboard: { view: "agenda", cal: ["x"] },
      parade: { users: ["u"] },
    });
  });

  it("drops mismatched types entirely instead of throwing", () => {
    expect(
      normalizeUiState({
        lastPage: 42,
        dashboard: { view: 7, date: null, month: 0, cal: "a,b", users: ["u", 3, ""], types: {} },
        parade: ["array"],
      }),
    ).toEqual({ dashboard: { users: ["u"] } });
  });

  it("drops empty id lists (unfiltered = role default) and empty sections", () => {
    expect(normalizeUiState({ dashboard: { cal: [], users: [], view: "month" } })).toEqual({
      dashboard: { view: "month" },
    });
    // the section vanishes, other valid fields survive
    expect(normalizeUiState({ dashboard: { cal: [] }, lastPage: "/x" })).toEqual({
      lastPage: "/x",
    });
  });

  it("drops lastPage values that are not absolute paths", () => {
    expect(normalizeUiState({ lastPage: "dashboard" })).toEqual({});
    expect(normalizeUiState({ lastPage: "https://evil.example" })).toEqual({});
  });
});

describe("mergeUiState", () => {
  const current = {
    lastPage: "/dashboard",
    dashboard: { view: "month" },
    parade: { month: "2026-08" },
  };

  it("patches only the sections it is given", () => {
    expect(mergeUiState(current, { lastPage: "/parade-state" })).toEqual({
      lastPage: "/parade-state",
      dashboard: { view: "month" },
      parade: { month: "2026-08" },
    });
  });

  it("replaces a section wholesale", () => {
    expect(mergeUiState(current, { dashboard: { view: "week", date: "2026-08-10" } })).toEqual({
      lastPage: "/dashboard",
      dashboard: { view: "week", date: "2026-08-10" },
      parade: { month: "2026-08" },
    });
  });
});

describe("freshMarkerNeeded", () => {
  const keys = ["view", "date", "month", "cal", "users", "types"];

  it("is true when any remembered key is removed", () => {
    expect(freshMarkerNeeded({ view: null, month: "2026-08" }, keys)).toBe(true);
    expect(freshMarkerNeeded({ cal: null, users: null, types: null }, keys)).toBe(true);
    expect(freshMarkerNeeded({ users: null }, keys)).toBe(true);
  });

  it("is false when nothing is removed", () => {
    expect(freshMarkerNeeded({ view: "week", date: "2026-08-10" }, keys)).toBe(false);
    expect(freshMarkerNeeded({ month: "2026-09" }, keys)).toBe(false);
    expect(freshMarkerNeeded({}, keys)).toBe(false);
  });
});

describe("resolveLaunchTarget", () => {
  it("returns the base pages as-is", () => {
    expect(resolveLaunchTarget("/dashboard", "user")).toBe("/dashboard");
    expect(resolveLaunchTarget("/parade-state", "admin")).toBe("/parade-state");
    expect(resolveLaunchTarget("/contacts", "user")).toBe("/contacts");
  });

  it("maps /settings to its default sub-tab for admins only", () => {
    expect(resolveLaunchTarget("/settings", "admin")).toBe("/settings/users");
    expect(resolveLaunchTarget("/settings", "user")).toBe("/dashboard");
  });

  it("keeps known settings sub-tabs for admins", () => {
    for (const tab of [
      "/settings/users",
      "/settings/departments",
      "/settings/event-types",
      "/settings/templates",
      "/settings/general",
      "/settings/audit-log",
    ]) {
      expect(resolveLaunchTarget(tab, "admin")).toBe(tab);
    }
  });

  it("falls back for non-admins, unknown sub-tabs, and garbage", () => {
    expect(resolveLaunchTarget("/settings/audit-log", "user")).toBe("/dashboard");
    expect(resolveLaunchTarget("/settings/unknown", "admin")).toBe("/settings/users");
    expect(resolveLaunchTarget("/nope", "admin")).toBe("/dashboard");
    expect(resolveLaunchTarget(undefined, "admin")).toBe("/dashboard");
    expect(resolveLaunchTarget("dashboard", "admin")).toBe("/dashboard");
    expect(resolveLaunchTarget("/", "admin")).toBe("/dashboard");
  });
});

describe("UI_STATE_COOKIE", () => {
  it("is a stable, cookie-name-safe constant", () => {
    expect(UI_STATE_COOKIE).toMatch(/^[A-Za-z0-9._-]+$/);
  });
});

function toBase64Url(value: string): string {
  // Mirrors the production encoder so tests can build inputs without the
  // browser-only btoa (vitest runs in a bare node env).
  const binary = Buffer.from(value, "utf8").toString("base64");
  return binary.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
