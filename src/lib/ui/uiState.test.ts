import { describe, expect, it } from "vitest";

import {
  DASHBOARD_VIEW_VALUES,
  UI_STATE_COOKIE,
  buildDashboardPersist,
  decodeUiState,
  encodeUiState,
  freshMarkerNeeded,
  mergeUiState,
  normalizePinnedViews,
  normalizeUiState,
  orderDashboardViews,
  reduceUiStateForCookie,
  resolveDashboardFilters,
  resolveDashboardView,
  resolveFilterMode,
  resolveLaunchTarget,
  type DashboardPersistSeed,
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
      pinnedViews: ["agenda", "week"],
      zoom: 1.5,
    },
    parade: { cal: ["c9"], users: ["u9"] },
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

  it("drops a stale parade date/month (the day is never remembered)", () => {
    expect(
      normalizeUiState({
        parade: { date: "2026-08-20", month: "2026-08", users: ["u"] },
      }),
    ).toEqual({ parade: { users: ["u"] } });
  });

  it("drops mismatched types entirely instead of throwing", () => {
    expect(
      normalizeUiState({
        lastPage: 42,
        dashboard: {
          view: 7,
          date: null,
          month: 0,
          cal: "a,b",
          users: ["u", 3, ""],
          types: {},
          pinnedViews: "agenda",
        },
        parade: ["array"],
      }),
    ).toEqual({ dashboard: { users: ["u"] } });
  });

  it("drops empty id lists (unfiltered = role default) and empty sections", () => {
    expect(normalizeUiState({ dashboard: { cal: [], users: [], view: "month" } })).toEqual({
      dashboard: { view: "month" },
    });
    expect(
      normalizeUiState({ dashboard: { pinnedViews: [], view: "month" } }),
    ).toEqual({ dashboard: { view: "month" } });
    // the section vanishes, other valid fields survive
    expect(normalizeUiState({ dashboard: { cal: [] }, lastPage: "/x" })).toEqual({
      lastPage: "/x",
    });
  });

  it("keeps known pinnedViews in order, dropping unknown and duplicate values", () => {
    expect(
      normalizeUiState({
        dashboard: {
          view: "month",
          pinnedViews: ["agenda", "nope", "agenda", "week", 42, "schedule"],
        },
      }),
    ).toEqual({ dashboard: { view: "month", pinnedViews: ["agenda", "week", "schedule"] } });
  });

  it("drops lastPage values that are not absolute paths", () => {
    expect(normalizeUiState({ lastPage: "dashboard" })).toEqual({});
    expect(normalizeUiState({ lastPage: "https://evil.example" })).toEqual({});
  });

  it("keeps sidebarCollapsed only when it is a real boolean (both values)", () => {
    expect(normalizeUiState({ sidebarCollapsed: true })).toEqual({ sidebarCollapsed: true });
    expect(normalizeUiState({ sidebarCollapsed: false })).toEqual({ sidebarCollapsed: false });
  });

  it("drops mismatched sidebarCollapsed types", () => {
    expect(normalizeUiState({ sidebarCollapsed: "true" })).toEqual({});
    expect(normalizeUiState({ sidebarCollapsed: 1 })).toEqual({});
    expect(normalizeUiState({ sidebarCollapsed: null })).toEqual({});
  });

  it("keeps a remembered zoom level and snaps a stale one to the nearest level", () => {
    expect(normalizeUiState({ dashboard: { zoom: 1.25 } })).toEqual({ dashboard: { zoom: 1.25 } });
    expect(normalizeUiState({ dashboard: { zoom: 1.1 } })).toEqual({ dashboard: { zoom: 1 } });
    expect(normalizeUiState({ dashboard: { zoom: 1.4 } })).toEqual({ dashboard: { zoom: 1.5 } });
  });

  it("drops non-numeric or non-finite zoom (a corrupted cookie degrades, never throws)", () => {
    expect(normalizeUiState({ dashboard: { zoom: "2" } })).toEqual({});
    expect(normalizeUiState({ dashboard: { zoom: null } })).toEqual({});
    expect(normalizeUiState({ dashboard: { zoom: Number.NaN } })).toEqual({});
    expect(normalizeUiState({ dashboard: { zoom: Number.POSITIVE_INFINITY } })).toEqual({});
  });

  it("keeps per-view filter mode and its view sets, keeping explicit empty lists", () => {
    expect(
      normalizeUiState({
        dashboard: {
          view: "week",
          filterMode: "per-view",
          views: {
            month: { cal: ["c1"], users: [] },
            week: { cal: ["c2"], users: ["u1"], types: ["Leave"] },
            schedule: { types: [] },
            nope: { cal: ["c9"] },
          },
        },
      }),
    ).toEqual({
      dashboard: {
        view: "week",
        filterMode: "per-view",
        // month's users and schedule's types are explicit "cleared" states and
        // stay; unknown view "nope" drops.
        views: {
          month: { cal: ["c1"], users: [] },
          week: { cal: ["c2"], users: ["u1"], types: ["Leave"] },
          schedule: { types: [] },
        },
      },
    });
  });

  it("drops per-view sets that are not plain objects and blank list entries", () => {
    expect(
      normalizeUiState({
        dashboard: {
          filterMode: "per-view",
          views: {
            month: ["c1"],
            week: 42,
            agenda: { cal: [], users: ["u", ""] },
          },
        },
      }),
    ).toEqual({
      dashboard: {
        filterMode: "per-view",
        // agenda keeps its explicit empty cal and non-empty users.
        views: { agenda: { cal: [], users: ["u"] } },
      },
    });
  });

  it("drops the whole views map in a global cookie (it can't leak into the shared set)", () => {
    expect(
      normalizeUiState({
        dashboard: { filterMode: "global", views: { month: { cal: ["c1"] } }, cal: ["c9"] },
      }),
    ).toEqual({ dashboard: { cal: ["c9"] } });
  });

  it("drops corrupted filterMode values (absent = global) and empty views", () => {
    expect(normalizeUiState({ dashboard: { filterMode: "every-view-its-own" } })).toEqual({});
    expect(
      normalizeUiState({ dashboard: { filterMode: "per-view", views: {} } }),
    ).toEqual({ dashboard: { filterMode: "per-view" } });
  });
});

describe("mergeUiState", () => {
  const current = {
    lastPage: "/dashboard",
    dashboard: { view: "month" },
    parade: { cal: ["c1"] },
  };

  it("patches only the sections it is given", () => {
    expect(mergeUiState(current, { lastPage: "/parade-state" })).toEqual({
      lastPage: "/parade-state",
      dashboard: { view: "month" },
      parade: { cal: ["c1"] },
    });
  });

  it("replaces a section wholesale", () => {
    expect(mergeUiState(current, { dashboard: { view: "week", date: "2026-08-10" } })).toEqual({
      lastPage: "/dashboard",
      dashboard: { view: "week", date: "2026-08-10" },
      parade: { cal: ["c1"] },
    });
  });

  it("merges sidebarCollapsed with patch-wins in both directions", () => {
    expect(mergeUiState({ sidebarCollapsed: false }, { sidebarCollapsed: true })).toEqual({
      sidebarCollapsed: true,
    });
    expect(mergeUiState({ sidebarCollapsed: true }, { sidebarCollapsed: false })).toEqual({
      sidebarCollapsed: false,
    });
  });

  it("keeps the current sidebarCollapsed when the patch omits it, and omits it when neither has it", () => {
    expect(mergeUiState({ sidebarCollapsed: true }, { lastPage: "/contacts" })).toEqual({
      lastPage: "/contacts",
      sidebarCollapsed: true,
    });
    expect(mergeUiState({}, { lastPage: "/contacts" })).toEqual({ lastPage: "/contacts" });
  });
});

describe("normalizePinnedViews", () => {
  it("returns [] for non-arrays", () => {
    expect(normalizePinnedViews(null)).toEqual([]);
    expect(normalizePinnedViews(undefined)).toEqual([]);
    expect(normalizePinnedViews("agenda")).toEqual([]);
    expect(normalizePinnedViews({ agenda: true })).toEqual([]);
  });

  it("keeps only known view values, de-duplicated, in stored order", () => {
    expect(normalizePinnedViews(["agenda", "junk", "agenda", "week", null, "month"])).toEqual([
      "agenda",
      "week",
      "month",
    ]);
  });
});

describe("orderDashboardViews", () => {
  it("returns the default tab order when nothing is pinned", () => {
    expect(orderDashboardViews([])).toEqual([...DASHBOARD_VIEW_VALUES]);
  });

  it("moves a single pin to the front", () => {
    expect(orderDashboardViews(["agenda"])).toEqual([
      "agenda",
      "month",
      "week",
      "weekv2",
      "schedule",
    ]);
  });

  it("keeps multiple pins in stored recency order (last pinned first)", () => {
    // The list is stored in recency order (index 0 = last pinned), so agenda
    // pinned after week is stored as ["agenda", "week"] and renders first.
    expect(orderDashboardViews(["agenda", "week"])).toEqual([
      "agenda",
      "week",
      "month",
      "weekv2",
      "schedule",
    ]);
  });

  it("ignores unknown values and duplicates without losing the rest", () => {
    expect(orderDashboardViews(["agenda", "nope", "agenda"])).toEqual([
      "agenda",
      "month",
      "week",
      "weekv2",
      "schedule",
    ]);
  });

  it("renders every view exactly once when all tabs are pinned", () => {
    expect(orderDashboardViews(["schedule", "weekv2", "week", "agenda", "month"])).toHaveLength(5);
    expect(new Set(orderDashboardViews(["schedule", "weekv2", "week", "agenda", "month"])).size).toBe(
      5,
    );
  });
});

describe("resolveDashboardView", () => {
  it("passes through every known view value", () => {
    for (const view of DASHBOARD_VIEW_VALUES) {
      expect(resolveDashboardView(view)).toBe(view);
    }
  });

  it("degrades unknown, empty, and non-string values to month", () => {
    for (const raw of [undefined, null, "", "day", "WEEK", 42, ["week"], {}]) {
      expect(resolveDashboardView(raw)).toBe("month");
    }
  });
});

describe("resolveFilterMode", () => {
  it("only per-view is truthy; anything else (incl. corrupt/absent) is global", () => {
    expect(resolveFilterMode("per-view")).toBe("per-view");
    expect(resolveFilterMode("global")).toBe("global");
    expect(resolveFilterMode(undefined)).toBe("global");
    expect(resolveFilterMode(42)).toBe("global");
    expect(resolveFilterMode("both")).toBe("global");
  });
});

describe("resolveDashboardFilters", () => {
  const defaults = { cal: ["default-cal"], users: [], types: [] };
  const global = { cal: ["shared-cal"], users: ["shared-user"], types: ["Leave"] };
  const url = (overrides: { cal?: string[]; users?: string[]; types?: string[] } = {}) => ({
    cal: overrides.cal,
    users: overrides.users,
    types: overrides.types,
  });

  it("resolves every view from the shared set and the role default (global mode)", () => {
    const { selected, viewFilters } = resolveDashboardFilters({
      view: "week",
      url: url(),
      views: {},
      global,
      defaults,
    });
    expect(selected).toEqual({ cal: ["shared-cal"], users: ["shared-user"], types: ["Leave"] });
    expect(viewFilters.month).toEqual(selected);
    expect(viewFilters.agenda).toEqual(selected);
    expect(viewFilters.schedule).toEqual(selected);
  });

  it("lets the URL win for the current view only", () => {
    const { selected, viewFilters } = resolveDashboardFilters({
      view: "week",
      url: url({ cal: ["pinned-cal"], users: [] }),
      views: {},
      global,
      defaults,
    });
    // `?cal=pinned-cal&users=` — an explicit empty users is honored.
    expect(selected).toEqual({ cal: ["pinned-cal"], users: [], types: ["Leave"] });
    // Other views are never URL-pinned.
    expect(viewFilters.month.cal).toEqual(["shared-cal"]);
  });

  it("falls back view → shared → role default in per-view mode", () => {
    const { selected, viewFilters } = resolveDashboardFilters({
      view: "week",
      url: url(),
      views: {
        week: { cal: ["week-cal"], users: ["week-user"] },
        agenda: { types: ["Overseas"] },
      },
      global,
      defaults,
    });
    expect(selected).toEqual({ cal: ["week-cal"], users: ["week-user"], types: ["Leave"] });
    // agenda overrides only types; its cal/users come from the shared set.
    expect(viewFilters.agenda).toEqual({ cal: ["shared-cal"], users: ["shared-user"], types: ["Overseas"] });
    // An unmasked view falls through to the shared set.
    expect(viewFilters.month).toEqual(global);
    expect(viewFilters.schedule).toEqual(global);
  });

  it("lets an explicit empty per-view list win over the shared set (cleared view)", () => {
    const { selected, viewFilters } = resolveDashboardFilters({
      view: "week",
      url: url(),
      // agenda explicitly cleared users while the shared set still picks someone.
      views: { agenda: { users: [] } },
      global: { cal: ["shared-cal"], users: ["shared-user"], types: [] },
      defaults,
    });
    expect(viewFilters.agenda.users).toEqual([]);
    // An absent key still falls through to the shared set.
    expect(viewFilters.agenda.cal).toEqual(["shared-cal"]);
    expect(selected.users).toEqual(["shared-user"]);
  });

  it("on _fresh the current view resolves from defaults (or URL), other views keep their memories", () => {
    const views = { week: { cal: ["week-cal"] }, agenda: { users: ["u9"] } };
    const { selected, viewFilters } = resolveDashboardFilters({
      view: "week",
      url: url(),
      views,
      global,
      defaults,
      fresh: true,
    });
    // Cleared view falls back to the role default (shared set skipped too).
    expect(selected).toEqual(defaults);
    // Other views must survive the clear untouched.
    expect(viewFilters.agenda.users).toEqual(["u9"]);
    expect(viewFilters.agenda.cal).toEqual(["shared-cal"]);
  });

  it("keeps honoring the URL even on a _fresh render (explicit intent wins)", () => {
    const { selected, viewFilters } = resolveDashboardFilters({
      view: "week",
      url: url({ cal: ["pinned"] }),
      views: { week: { cal: ["week-cal"] } },
      global,
      defaults,
      fresh: true,
    });
    expect(selected.cal).toEqual(["pinned"]);
    // The skipped view memory still governs the other views.
    expect(viewFilters.week.cal).toEqual(["pinned"]);
  });

  it("produces a full five-view map covering the shared defaults", () => {
    const { viewFilters } = resolveDashboardFilters({
      view: "month",
      url: url(),
      views: {},
      global: {},
      defaults,
    });
    expect(Object.keys(viewFilters).sort()).toEqual([...DASHBOARD_VIEW_VALUES].sort());
    for (const view of DASHBOARD_VIEW_VALUES) {
      expect(viewFilters[view]).toEqual(defaults);
    }
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

describe("cookie schema versioning", () => {
  const current: [number, number] = [2, 0];
  const cookie = (payload: unknown) => toBase64Url(JSON.stringify(payload));

  it("decodeUiState reads a cookie stamped with the current version", () => {
    expect(decodeUiState(cookie({ v: current, dashboard: { view: "week" } }))).toEqual({
      dashboard: { view: "week" },
    });
  });

  it("encodeUiState stamps the current [major, minor] (round-trip keeps fields)", () => {
    const raw = decodeRaw(encodeUiState({ lastPage: "/contacts" }));
    expect(raw.v).toEqual(current);
    expect(decodeUiState(encodeUiState({ lastPage: "/contacts" }))).toEqual({
      lastPage: "/contacts",
    });
  });

  it("drops a legacy v1 cookie (no version field)", () => {
    expect(decodeUiState(cookie({ dashboard: { view: "week" } }))).toBeNull();
  });

  it("drops a cookie with a different major in both directions", () => {
    expect(decodeUiState(cookie({ v: [1, 0], dashboard: { view: "week" } }))).toBeNull();
    expect(decodeUiState(cookie({ v: [3, 0], dashboard: { view: "week" } }))).toBeNull();
  });

  it("decodes a NEWER minor within the same major (forward-compatible)", () => {
    expect(
      decodeUiState(cookie({ v: [current[0], current[1] + 1], dashboard: { view: "week" } })),
    ).toEqual({ dashboard: { view: "week" } });
  });

  it("drops a cookie whose minor requires a migration this build cannot run", () => {
    expect(decodeUiState(cookie({ v: [current[0], -1], dashboard: { view: "week" } }))).toBeNull();
  });

  it("drops a malformed version field (treated as legacy)", () => {
    expect(decodeUiState(cookie({ v: "2", dashboard: { view: "week" } }))).toBeNull();
    expect(decodeUiState(cookie({ v: [2], dashboard: { view: "week" } }))).toBeNull();
    expect(decodeUiState(cookie({ v: { major: 2, minor: 0 }, dashboard: { view: "week" } }))).toBeNull();
    expect(decodeUiState(cookie({ v: [2, 0.5], dashboard: { view: "week" } }))).toBeNull();
  });
});

describe("buildDashboardPersist", () => {
  const seed = (over: Partial<DashboardPersistSeed> = {}): DashboardPersistSeed => ({
    view: "week",
    selected: { cal: ["c1"], users: [], types: [] },
    pinnedViews: [],
    zoom: null,
    filterMode: "per-view",
    urlKeys: { cal: false, users: false, types: false },
    ...over,
  });

  it("never materializes a view the URL does not pin and the cookie does not know", () => {
    expect(buildDashboardPersist(undefined, seed())).toEqual({
      view: "week",
      cal: ["c1"],
      users: [],
      types: [],
      filterMode: "per-view",
    });
  });

  it("records a resolved selection when the URL pins its key", () => {
    expect(
      buildDashboardPersist(undefined, seed({ urlKeys: { cal: false, users: true, types: false } })),
    ).toEqual({
      view: "week",
      cal: ["c1"],
      users: [],
      types: [],
      filterMode: "per-view",
      views: { week: { users: [] } },
    });
  });

  it("keeps a previously-remembered key fresh even when the URL is silent", () => {
    const prev = { views: { week: { cal: ["c1"], users: ["u1"] } } };
    const built = buildDashboardPersist(prev, seed({ selected: { cal: ["c1"], users: ["u1"], types: [] } }));
    expect(built.views).toEqual({ week: { cal: ["c1"], users: ["u1"] } });
  });

  it("keeps an explicit CLEAR (empty) alive for a view that previously remembered the key", () => {
    const prev = { views: { week: { users: ["u1"] } }, users: ["u1"] };
    const built = buildDashboardPersist(prev, seed({ selected: { cal: ["c1"], users: [], types: [] } }));
    expect(built.views).toEqual({ week: { users: [] } });
  });

  it("preserves other views' memory untouched while updating the current view", () => {
    const prev = { views: { month: { users: ["m1"] } } };
    const built = buildDashboardPersist(prev, seed({ urlKeys: { cal: false, users: true, types: false } }));
    expect(built.views).toEqual({ month: { users: ["m1"] }, week: { users: [] } });
  });

  it("does not grow the views map for a view with no memory and nothing pinned", () => {
    const prev = { views: { month: { users: ["m1"] } } };
    const built = buildDashboardPersist(prev, seed({ selected: { cal: ["c1"], users: [], types: [] } }));
    expect(built.views).toEqual({ month: { users: ["m1"] } });
  });

  it("global mode writes the shared set and prunes views/filterMode from a per-view cookie", () => {
    const prev = { views: { week: { users: ["u1"] } }, filterMode: "per-view" as const };
    expect(buildDashboardPersist(prev, seed({ filterMode: "global" }))).toEqual({
      view: "week",
      cal: ["c1"],
      users: [],
      types: [],
    });
  });

  it("keeps scalars (date/month/pinnedViews/zoom) as given", () => {
    expect(
      buildDashboardPersist(undefined, seed({ date: "2026-09-01", month: "2026-09", pinnedViews: ["week"], zoom: 1.5 })),
    ).toEqual(
      expect.objectContaining({
        date: "2026-09-01",
        month: "2026-09",
        pinnedViews: ["week"],
        zoom: 1.5,
      }),
    );
  });
});

describe("reduceUiStateForCookie", () => {
  it("is a no-op (same reference) when only scalars remain", () => {
    const state = { dashboard: { view: "month", date: "2026-09-01" } };
    expect(reduceUiStateForCookie(state)).toBe(state);
    expect(reduceUiStateForCookie({})).toEqual({});
  });

  it("drops parade lists before shared lists before per-view user lists", () => {
    const state = {
      parade: { cal: ["p1", "p2"], users: ["pu"] },
      dashboard: {
        users: ["s1", "s2"],
        views: { week: { users: ["u1", "u2", "u3"] } } as Record<string, Record<string, string[]>>,
      },
    };
    // Pass 1: parade.cal is the largest tier-0 list → dropped first.
    let reduced = reduceUiStateForCookie(state);
    expect(reduced.parade).toEqual({ users: ["pu"] });
    expect(reduced.dashboard!.users).toEqual(["s1", "s2"]);
    // Pass 2: parade.users + shared users tie tiers? tiers: parade(tier0) first.
    reduced = reduceUiStateForCookie(reduced);
    expect(reduced.parade).toBeUndefined();
    expect(reduced.dashboard!.users).toEqual(["s1", "s2"]);
    // Pass 3: shared users (tier1) before the per-view users (tier4).
    reduced = reduceUiStateForCookie(reduced);
    expect(reduced.dashboard!.users).toBeUndefined();
    expect(reduced.dashboard!.views!.week!.users).toEqual(["u1", "u2", "u3"]);
  });

  it("drops the largest list first within a tier", () => {
    const state = {
      dashboard: { cal: ["c1"], types: ["t1"], users: ["u1", "u2", "u3"] },
    };
    expect(reduceUiStateForCookie(state).dashboard!.users).toBeUndefined(); // largest, same tier
  });

  it("prunes empty view stubs and containers after a drop", () => {
    const state = { dashboard: { views: { week: { cal: ["c1", "c2"] } } } };
    const reduced = reduceUiStateForCookie(state);
    expect(reduced.dashboard!.views).toBeUndefined();
    expect(reduced).toEqual({ dashboard: {} });
  });

  it("does not mutate its input", () => {
    const state = {
      parade: { cal: ["p1"] },
      dashboard: { views: { week: { cal: ["c1"], users: ["u1"] } } },
    };
    const snapshot = JSON.parse(JSON.stringify(state));
    reduceUiStateForCookie(state);
    expect(state).toEqual(snapshot);
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

function decodeRaw(value: string): Record<string, unknown> {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
}
