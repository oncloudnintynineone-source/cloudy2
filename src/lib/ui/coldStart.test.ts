import { describe, expect, it } from "vitest";

import {
  MIN_COLD_LOAD_MS,
  coldStartInitialState,
  coldStartReducer,
  coldStartRouteRequiresContent,
  type ColdStartState,
} from "./coldStart";

const T0 = 100_000;

function stateAt(overrides: Partial<ColdStartState> = {}): ColdStartState {
  return { ...coldStartInitialState, ...overrides };
}

describe("coldStartReducer", () => {
  it("starts idle and enters loading when the first leg begins", () => {
    const next = coldStartReducer(coldStartInitialState, {
      type: "LEG_BEGIN",
      leg: "pinned",
      now: T0,
    });
    expect(next.phase).toBe("loading");
    expect(next.startedAt).toBe(T0);
    expect(next.pending).toEqual({ pinned: true });
  });

  it("keeps waiting while a leg is still in flight even with content landed", () => {
    let state = coldStartReducer(stateAt(), {
      type: "LEG_BEGIN",
      leg: "pinned",
      now: T0,
    });
    state = coldStartReducer(state, {
      type: "LEG_BEGIN",
      leg: "clashes",
      now: T0,
    });
    state = coldStartReducer(state, { type: "CONTENT_LANDED", now: T0 + 200 });
    state = coldStartReducer(state, { type: "LEG_SETTLE", leg: "pinned", now: T0 + 200 });
    // clashes still pending → stays loading even past the perceptible window.
    expect(state.phase).toBe("loading");
    expect(state.pending).toEqual({ clashes: true });
  });

  it("confirms ready once every leg settles, content lands, and the load was perceptible", () => {
    let state = coldStartReducer(stateAt(), {
      type: "LEG_BEGIN",
      leg: "pinned",
      now: T0,
    });
    state = coldStartReducer(state, { type: "CONTENT_LANDED", now: T0 + 300 });
    state = coldStartReducer(state, { type: "LEG_SETTLE", leg: "pinned", now: T0 + 300 });
    expect(state.phase).toBe("ready");
  });

  it("skips the confirmation (done) when the whole load was imperceptibly short", () => {
    let state = coldStartReducer(stateAt(), {
      type: "LEG_BEGIN",
      leg: "pinned",
      now: T0,
    });
    state = coldStartReducer(state, { type: "CONTENT_LANDED", now: T0 + 100 });
    state = coldStartReducer(state, { type: "LEG_SETTLE", leg: "pinned", now: T0 + 100 });
    expect(state.phase).toBe("done");
    expect(MIN_COLD_LOAD_MS).toBeGreaterThan(100);
  });

  it("waits for content on routes that require it (contentWaived false)", () => {
    let state = coldStartReducer(stateAt(), {
      type: "LEG_BEGIN",
      leg: "pinned",
      now: T0,
    });
    // Leg settles quickly but the route's content has not streamed yet.
    state = coldStartReducer(state, { type: "LEG_SETTLE", leg: "pinned", now: T0 + 400 });
    expect(state.phase).toBe("loading");
    state = coldStartReducer(state, { type: "CONTENT_LANDED", now: T0 + 900 });
    expect(state.phase).toBe("ready");
  });

  it("confirms without a content report on waived routes (contentWaived true)", () => {
    let state = coldStartReducer(stateAt({ contentWaived: true }), {
      type: "LEG_BEGIN",
      leg: "pinned",
      now: T0,
    });
    state = coldStartReducer(state, { type: "LEG_SETTLE", leg: "pinned", now: T0 + 300 });
    expect(state.phase).toBe("ready");
  });

  it("keeps loading (no force-end) while any leg is still in flight, however long", () => {
    let state = coldStartReducer(stateAt(), {
      type: "LEG_BEGIN",
      leg: "pinned",
      now: T0,
    });
    state = coldStartReducer(state, { type: "LEG_BEGIN", leg: "clashes", now: T0 });
    state = coldStartReducer(state, { type: "CONTENT_LANDED", now: T0 + 100 });
    // A cold backend keeps the amber strip pulsing for as long as a leg is
    // genuinely pending — settling one leg long after the old 4s cap must not
    // force-end the machine while another is still in flight.
    state = coldStartReducer(state, { type: "LEG_SETTLE", leg: "clashes", now: T0 + 60_000 });
    expect(state.phase).toBe("loading");
    expect(state.pending).toEqual({ pinned: true });
    state = coldStartReducer(state, { type: "LEG_SETTLE", leg: "pinned", now: T0 + 60_000 });
    expect(state.phase).toBe("ready");
  });

  it("finishes the ready dwell and then ignores everything (once per session)", () => {
    let state = coldStartReducer(stateAt(), {
      type: "LEG_BEGIN",
      leg: "pinned",
      now: T0,
    });
    state = coldStartReducer(state, { type: "CONTENT_LANDED", now: T0 + 300 });
    state = coldStartReducer(state, { type: "LEG_SETTLE", leg: "pinned", now: T0 + 300 });
    expect(state.phase).toBe("ready");
    state = coldStartReducer(state, { type: "FINISH", now: T0 + 1600 });
    expect(state.phase).toBe("done");

    // A later soft navigation must not restart the machine.
    const after = coldStartReducer(state, { type: "LEG_BEGIN", leg: "pinned", now: T0 + 5000 });
    expect(after.phase).toBe("done");
  });
});

describe("coldStartRouteRequiresContent", () => {
  it("requires content for the data-gated routes", () => {
    expect(coldStartRouteRequiresContent("/dashboard")).toBe(true);
    expect(coldStartRouteRequiresContent("/parade-state")).toBe(true);
    expect(coldStartRouteRequiresContent("/double-booking")).toBe(true);
    expect(coldStartRouteRequiresContent("/kah-status")).toBe(true);
    expect(coldStartRouteRequiresContent("/settings/audit-log")).toBe(true);
  });

  it("does not match a sibling route sharing a prefix", () => {
    expect(coldStartRouteRequiresContent("/dashboard2")).toBe(false);
    expect(coldStartRouteRequiresContent("/parade-state-history")).toBe(false);
    expect(coldStartRouteRequiresContent("/settings/audit-log-old")).toBe(false);
  });

  it("waives content for static routes", () => {
    expect(coldStartRouteRequiresContent("/settings/general")).toBe(false);
    expect(coldStartRouteRequiresContent("/contacts")).toBe(false);
    expect(coldStartRouteRequiresContent("/")).toBe(false);
  });
});
