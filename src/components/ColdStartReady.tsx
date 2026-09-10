"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

import { announce } from "@/lib/ui/announcer";
import {
  READY_DWELL_MS,
  coldStartInitialState,
  coldStartReducer,
  coldStartRouteRequiresContent,
  type ColdStartPhase,
} from "@/lib/ui/coldStart";

/**
 * Cold-start readiness indicator (docs/loading-transitions.md §1.13.1).
 *
 * On a fresh document load the shell paints its chrome first, then pulls the
 * remaining data async (the pinned-events list and the double-booking count
 * are mount-effect fetches; the landing route's content streams server-side).
 * This provider tracks that once-per-launch tail and exposes a phase the bar
 * renders: the global activity bar's amber strip (its own slot) while any
 * cold-start leg is in flight, then a brief green "ready" bar once the last
 * leg settles — the explicit "all data is loaded" moment the static chrome
 * never gave users. It runs exactly once per shell mount: the phase machine
 * reaches `done` and never re-arms on soft navigations.
 *
 * Legs register via `beginLeg`/`settleLeg` from the shell's mount fetches and
 * `reportContentLanded` from the landing data view (routes that stream heavy
 * content — see `COLD_CONTENT_ROUTES`). The reducer is pure and unit-tested;
 * this component only feeds it the clock and the route's content-waiver flag.
 */
export interface ColdStartReadyValue {
  phase: ColdStartPhase;
  /** Marks a named cold-start leg as in flight (idempotent). */
  beginLeg: (leg: string) => void;
  /** Marks the named leg settled — success or failure (idempotent). */
  settleLeg: (leg: string) => void;
  /** Called once by the landing data view when its content is shown. */
  reportContentLanded: () => void;
}

const ColdStartReadyContext = createContext<ColdStartReadyValue | null>(null);

/** Reads the cold-start readiness controls; throws outside the provider. */
export function useColdStartReady(): ColdStartReadyValue {
  const value = useContext(ColdStartReadyContext);
  if (value === null) {
    throw new Error("useColdStartReady must be used within a ColdStartReadyProvider");
  }
  return value;
}

/**
 * Content-landed reporter for the landing data view. Call it once from the
 * root of a data route that gates its content on a client loading flag (the
 * dashboard grid, parade state, audit list…) — it only mounts after the
 * route's RSC data has streamed, so reporting on mount is exactly "content
 * painted". Whichever cold-start route is mounted reports once; later
 * mountings are no-ops once the machine has finished.
 */
export function useColdStartContent() {
  const { reportContentLanded } = useColdStartReady();
  useEffect(() => {
    reportContentLanded();
  }, [reportContentLanded]);
}

/**
 * Context provider for the readiness machine. Mount it once in the shell,
 * above both the header (where the bar renders) and the routed views (whose
 * content-landed reports flow up). The route's content-waiver flag is fixed at
 * mount — the cold start always lands on one URL.
 */
export function ColdStartReadyProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [state, dispatch] = useReducer(coldStartReducer, coldStartInitialState, (init) => ({
    ...init,
    contentWaived: !coldStartRouteRequiresContent(pathname),
  }));

  const beginLeg = useCallback(
    (leg: string) => dispatch({ type: "LEG_BEGIN", leg, now: Date.now() }),
    [],
  );
  const settleLeg = useCallback(
    (leg: string) => dispatch({ type: "LEG_SETTLE", leg, now: Date.now() }),
    [],
  );
  const reportContentLanded = useCallback(
    () => dispatch({ type: "CONTENT_LANDED", now: Date.now() }),
    [],
  );

  // On entering the ready phase: announce the confirmation and dwell on the
  // green bar, then finish — the machine stays `done` for the whole session.
  useEffect(() => {
    if (state.phase !== "ready") return;
    announce("Calendar up to date");
    const id = window.setTimeout(
      () => dispatch({ type: "FINISH", now: Date.now() }),
      READY_DWELL_MS,
    );
    return () => window.clearTimeout(id);
  }, [state.phase]);

  const value = useMemo<ColdStartReadyValue>(
    () => ({ phase: state.phase, beginLeg, settleLeg, reportContentLanded }),
    [state.phase, beginLeg, settleLeg, reportContentLanded],
  );

  return (
    <ColdStartReadyContext.Provider value={value}>{children}</ColdStartReadyContext.Provider>
  );
}

/**
 * The readiness bar — mount it inside `AppShell.Header`, flush at its bottom
 * edge (same slot as the generic ActivityBar). While the cold-start tail is in
 * flight it renders the standard amber activity strip; once every leg settles
 * it swaps to the green `c2-ready-bar` for the dwell, then unmounts. The
 * generic ActivityBar suppresses itself during the cold-start phases so the
 * two never double up in the same 4px slot.
 */
export function ColdStartReadyBar() {
  const { phase } = useColdStartReady();
  if (phase === "loading") {
    return (
      <div
        className="c2-activity-bar c2-activity-bar-active"
        role="progressbar"
        aria-label="Loading"
      ></div>
    );
  }
  if (phase === "ready") {
    return (
      <div className="c2-ready-bar" role="status" aria-label="Calendar up to date"></div>
    );
  }
  return null;
}
