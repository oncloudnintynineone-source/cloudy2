"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { invalidateCurrentPathCaches } from "@/lib/pwa/client";
import { beginActivity, endActivity, isActivityBusy, type ActivityCounts } from "@/lib/ui/activity";
import { useColdStartReady } from "@/components/ColdStartReady";

/**
 * Shared global "something is loading" indicator (an indeterminate amber bar
 * flush under the header). Complements — never replaces — the skeleton-only
 * loading system (`docs/loading-transitions.md`). Skeletons cover *data
 * navigations*; the activity bar additionally covers the moments a skeleton
 * can't:
 *
 * - the invisible `router.refresh()` that follows a mutation (the button's
 *   loader blinks during the save, but the refresh after is silent on a slow
 *   network),
 * - route navigations that carry no content-shaped skeleton of their own,
 * - the brief warm-cache window where a view resolves faster than a skeleton
 *   would read.
 *
 * Sources report busy-ness through the refcounted `begin`/`end` controls:
 * `begin(key)` on the rising edge, `end(key)` on settle. Deep/fast sources
 * (a route nav overlapping a mutation refresh) don't fight — the bar shows
 * while *any* key is busy.
 *
 * The context is split in two so the many reporters don't pay for the bar's
 * animation state:
 *
 * - `ActivityControlsContext` (`useActivityControls`) carries only `begin`/
 *   `end`, which never change identity — so a `useReportActivity` consumer
 *   re-renders only when its own `active` flag flips, never when the bar shows
 *   or hides.
 * - `ActivityStateContext` (`useActivityState`) carries the changing half
 *   (`anyBusy`, `stripVisible`) and is read only by the bar and the header
 *   refresh icon.
 */

/**
 * A load must stay continuously busy this long before the bar appears.
 * Shorter loads — the typical quick warm-cache page switch or fast
 * post-mutation refresh — are over before anyone needs a progress signal, so
 * the bar never blips for them (the old immediate show flashed a split-second
 * bar on every navigation, however quick).
 */
export const ACTIVITY_SHOW_DELAY_MS = 300;

/**
 * How long the bar lingers once busy clears, so a load that did earn the bar
 * still reads as a deliberate, completed sequence rather than blinking out
 * the instant its work finishes. The exit itself is a CSS retract/fade (see
 * `globals.css`), so the removal never happens in a single frame.
 */
export const ACTIVITY_MIN_HOLD_MS = 150;

type ActivityControls = {
  /** Marks a named source as busy. Idempotent; safe to call more than once. */
  begin: (key: string) => void;
  /** Marks the named source as idle. Idempotent. */
  end: (key: string) => void;
};

type ActivityState = {
  /** True while at least one source is busy. */
  anyBusy: boolean;
  /**
   * True while the bar itself is on screen: a busy source has persisted
   * `ACTIVITY_SHOW_DELAY_MS` (and, on clear, until `ACTIVITY_MIN_HOLD_MS`
   * elapses). This is the generic bar alone — the cold-start readiness strip
   * is a separate phase (`useColdStartReady`); consumers that want "is the
   * header loading strip showing?" combine both. Only the `ActivityBar` and
   * the header refresh icon read this.
   */
  stripVisible: boolean;
};

const ActivityControlsContext = createContext<ActivityControls | null>(null);
const ActivityStateContext = createContext<ActivityState | null>(null);

/** Reads the stable activity controls; throws outside the AppShell provider. */
export function useActivityControls(): ActivityControls {
  const value = useContext(ActivityControlsContext);
  if (value === null) {
    throw new Error(
      "useActivityControls must be used within the AppShellShell ActivityProvider",
    );
  }
  return value;
}

/** Reads the changing activity state; throws outside the AppShell provider. */
export function useActivityState(): ActivityState {
  const value = useContext(ActivityStateContext);
  if (value === null) {
    throw new Error("useActivityState must be used within the AppShellShell ActivityProvider");
  }
  return value;
}

/**
 * Reports a single boolean "busy" source (a transition pending, a refresh in
 * flight) into the shared activity bar via `begin`/`end`. Call it from a
 * component that owns the flag.
 *
 * The begin/cleanup pairing is deliberate: the effect registers `end` as its
 * cleanup, so the key is released on the falling edge **and** when the reporter
 * unmounts while still active. The provider lives in the persistent shell, so a
 * reporter that unmounts mid-load (navigating away from the dashboard while its
 * read is in flight) used to leak its key and leave the bar stuck on forever.
 *
 * Only the stable controls context is read, so flipping the bar's visibility
 * never re-renders a reporter.
 */
export function useReportActivity(active: boolean, key: string) {
  const { begin, end } = useActivityControls();
  useEffect(() => {
    if (!active) return;
    begin(key);
    return () => end(key);
  }, [active, key, begin, end]);
}

/**
 * The post-mutation refresh reporter: `router.refresh()` is not awaitable, so
 * its "busy" signal is the transition it runs under — `isPending` stays true
 * until the refreshed RSC payload commits. Use this helper everywhere a
 * mutation clears the SW caches and re-reads the current route, so the
 * otherwise-invisible refresh (no skeleton, button loader already done) shows
 * on the activity bar. Returns a stable `refresh()` to drop into the existing
 * `void invalidateCurrentPathCaches().then(() => router.refresh())` sites.
 */
export function useActivityRefresh(busyKey: string) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  useReportActivity(isPending, busyKey);
  return useCallback(() => {
    void invalidateCurrentPathCaches().then(() => startTransition(() => router.refresh()));
  }, [router, startTransition]);
}

/**
 * Context provider for the activity bar. Mount it once in the shell wrapping
 * every reporter/consumer (pages call `useReportActivity`); render the
 * `<ActivityBar/>` separately inside the AppShell header so the bar sits flush
 * under it.
 *
 * The provider owns the bar's show-delay / min-hold timer machine so the
 * resulting `stripVisible` is a single shared source of truth — the bar and the
 * header refresh icon (which spins exactly while the strip is up) can't drift.
 * Both timers live in effects, never during render, so SSR is unaffected.
 */
export function ActivityProvider({ children }: { children: ReactNode }) {
  const counts = useRef<ActivityCounts>({});
  const [anyBusy, setAnyBusy] = useState(false);
  const [stripVisible, setStripVisible] = useState(false);
  const showTimer = useRef<number | null>(null);
  const holdTimer = useRef<number | null>(null);

  const begin = useCallback((key: string) => {
    counts.current = beginActivity(counts.current, key);
    setAnyBusy(isActivityBusy(counts.current));
  }, []);

  const end = useCallback((key: string) => {
    counts.current = endActivity(counts.current, key);
    setAnyBusy(isActivityBusy(counts.current));
  }, []);

  useEffect(() => {
    if (anyBusy) {
      // Rising edge (or busy returning mid-exit): cancel any pending hold and,
      // if the bar isn't shown yet, arm the show-delay timer.
      if (holdTimer.current !== null) {
        window.clearTimeout(holdTimer.current);
        holdTimer.current = null;
      }
      if (!stripVisible && showTimer.current === null) {
        showTimer.current = window.setTimeout(() => {
          showTimer.current = null;
          setStripVisible(true);
        }, ACTIVITY_SHOW_DELAY_MS);
      }
    } else {
      // Falling edge: cancel a still-pending show (the load ended before it
      // earned the bar — it never appears) and, if shown, arm the hold.
      if (showTimer.current !== null) {
        window.clearTimeout(showTimer.current);
        showTimer.current = null;
      }
      if (stripVisible && holdTimer.current === null) {
        holdTimer.current = window.setTimeout(() => {
          holdTimer.current = null;
          setStripVisible(false);
        }, ACTIVITY_MIN_HOLD_MS);
      }
    }

    return () => {
      if (showTimer.current !== null) {
        window.clearTimeout(showTimer.current);
        showTimer.current = null;
      }
      if (holdTimer.current !== null) {
        window.clearTimeout(holdTimer.current);
        holdTimer.current = null;
      }
    };
  }, [anyBusy, stripVisible]);

  const controls = useMemo(() => ({ begin, end }), [begin, end]);
  const state = useMemo(() => ({ anyBusy, stripVisible }), [anyBusy, stripVisible]);

  return (
    <ActivityControlsContext.Provider value={controls}>
      <ActivityStateContext.Provider value={state}>{children}</ActivityStateContext.Provider>
    </ActivityControlsContext.Provider>
  );
}

/**
 * The bar itself — mount it inside `AppShell.Header`, flush at its bottom edge
 * (the CSS positions it `absolute; bottom: 0`, so it sits on the header's
 * bottom border with no margin/padding above it). The show-delay / min-hold
 * timing lives in `ActivityProvider`; this component only renders the shared
 * `stripVisible`.
 *
 * While the once-per-launch cold-start readiness machine is loading or
 * confirming, it owns the header's bottom strip (see `ColdStartReadyBar`) —
 * suppress the generic bar so two strips never share the same 4px slot. The
 * suppression is render-only: the provider's timer machine keeps running
 * underneath, so the cold-start → activity hand-off is seamless (a source busy
 * through the cold start appears immediately at `done` instead of restarting
 * its 300 ms show-delay).
 */
export function ActivityBar() {
  const { stripVisible } = useActivityState();
  const { phase } = useColdStartReady();
  const visible = stripVisible && phase !== "loading" && phase !== "ready";

  return (
    <div
      className={visible ? "c2-activity-bar c2-activity-bar-active" : "c2-activity-bar"}
      role="progressbar"
      aria-label="Loading"
      aria-hidden={!visible}
      aria-valuemin={0}
      aria-valuemax={1}
    ></div>
  );
}
