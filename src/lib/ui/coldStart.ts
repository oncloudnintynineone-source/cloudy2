/**
 * Cold-start readiness state machine (docs/loading-transitions.md §1.13.1).
 *
 * On a fresh document load (a PWA relaunch or a hard navigation) the shell
 * paints its chrome and skeleton immediately, then pulls the remaining data
 * asynchronously: the pinned-events list and the double-booking clash count
 * are client-side server-action fetches kicked off by shell mount effects,
 * and the landing route's content arrives over the RSC stream. None of that
 * tail has an explicit "still working" signal today, so users stare at a
 * static header pill and guess. This module powers a once-per-cold-start
 * readiness indicator: the global activity bar's amber strip (same slot)
 * while the cold-start legs are in flight, morphing into a green bar once
 * the last leg settles.
 *
 * The reducer here is deliberately pure (no clock, no pathname) so it is
 * unit-testable; the provider feeds it `now` and the content-waiver flag.
 */

/** A load shorter than this never shows the green confirmation — nothing was
 *  perceptibly loading, so a "ready" flash would read as noise on warm opens. */
export const MIN_COLD_LOAD_MS = 250;

/** How long the green "ready" bar stays before it disappears for the session. */
export const READY_DWELL_MS = 1200;

/**
 * Route prefixes whose content streams server-side and must *land* before the
 * readiness bar confirms. The dashboard (the default landing), parade state,
 * double-booking, KAH status and the audit log all render data that can take
 * longer to stream than the chrome's client fetches; for these the green bar
 * must wait for the view to report content shown (see `useColdStartContent`).
 * All other routes stream their light content with the layout/chrome, so they
 * waive the content requirement and the bar confirms when the client legs
 * settle.
 */
export const COLD_CONTENT_ROUTES = [
  "/dashboard",
  "/parade-state",
  "/double-booking",
  "/kah-status",
  "/settings/audit-log",
] as const;

/** Pure: does this route require its content to land before ready fires? */
export function coldStartRouteRequiresContent(pathname: string): boolean {
  return COLD_CONTENT_ROUTES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export type ColdStartPhase = "idle" | "loading" | "ready" | "done";

export interface ColdStartState {
  phase: ColdStartPhase;
  /** Legs still in flight (a map keyed by leg name, e.g. `pinned`). */
  pending: Record<string, true>;
  /** Epoch ms when the first leg began — the moment the amber pulse starts. */
  startedAt: number | null;
  /** Epoch ms when the landing data view first reported content shown. */
  contentLandedAt: number | null;
  /** Routes that stream no independent content (settings, contacts…) waive the
   *  content requirement — their reads resolve with the layout/chrome stream. */
  contentWaived: boolean;
}

export const coldStartInitialState: ColdStartState = {
  phase: "idle",
  pending: {},
  startedAt: null,
  contentLandedAt: null,
  contentWaived: false,
};

export type ColdStartAction =
  | { type: "LEG_BEGIN"; leg: string; now: number }
  | { type: "LEG_SETTLE"; leg: string; now: number }
  | { type: "CONTENT_LANDED"; now: number }
  | { type: "FINISH"; now: number };

/**
 * The loading → ready decision, evaluated after every leg settle and content
 * report:
 *
 * - `contentReady`: the route's content has either landed or is waived.
 * - The bar turns green only when *all* pending legs settled AND content is
 *   ready AND the load has been perceptible (≥ MIN_COLD_LOAD_MS). A load that
 *   ends sooner never promised anything visible, so it skips straight to
 *   `done` — a warm open must not flash a meaningless confirmation.
 * - There is no time cap: a cold backend keeps the amber strip pulsing for as
 *   long as the legs are genuinely still in flight, and it only disappears
 *   once they settle. Both legs settle on resolve *or* reject (the shell wraps
 *   them in `.finally`), so they cannot hang indefinitely.
 */
function advance(state: ColdStartState, now: number): ColdStartState {
  if (state.phase !== "loading" || state.startedAt === null) return state;

  const allLegsSettled = Object.keys(state.pending).length === 0;
  const contentReady = state.contentWaived || state.contentLandedAt !== null;
  if (!allLegsSettled || !contentReady) return state;

  return {
    ...state,
    phase: now - state.startedAt >= MIN_COLD_LOAD_MS ? "ready" : "done",
  };
}

export function coldStartReducer(state: ColdStartState, action: ColdStartAction): ColdStartState {
  // Once finished (or confirming) the indicator never runs again this session —
  // a soft navigation must not restart it. Only the dwell's FINISH moves
  // `ready` → `done`; everything else is ignored.
  if (state.phase === "done") return state;

  switch (action.type) {
    case "LEG_BEGIN": {
      if (state.phase !== "idle" && state.phase !== "loading") return state;
      const pending: Record<string, true> = { ...state.pending };
      pending[action.leg] = true;
      const next: ColdStartState = {
        ...state,
        pending,
        phase: "loading",
        startedAt: state.startedAt ?? action.now,
      };
      return advance(next, action.now);
    }
    case "LEG_SETTLE": {
      if (state.phase !== "idle" && state.phase !== "loading") return state;
      const pending = { ...state.pending };
      delete pending[action.leg];
      return advance({ ...state, pending }, action.now);
    }
    case "CONTENT_LANDED": {
      if (state.phase !== "idle" && state.phase !== "loading") return state;
      const next: ColdStartState = {
        ...state,
        contentLandedAt: state.contentLandedAt ?? action.now,
      };
      return advance(next, action.now);
    }
    case "FINISH": {
      return state.phase === "ready" ? { ...state, phase: "done" } : state;
    }
    default:
      return state;
  }
}
