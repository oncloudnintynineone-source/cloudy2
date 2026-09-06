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
 * Sources report busy-ness through `useActivity()`'s refcounted `begin`/`end`:
 * `begin(key)` on the rising edge, `end(key)` on settle. Deep/fast sources
 * (a route nav overlapping a mutation refresh) don't fight — the bar shows
 * while *any* key is busy.
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

type ActivityValue = {
  /** Marks a named source as busy. Idempotent; safe to call more than once. */
  begin: (key: string) => void;
  /** Marks the named source as idle. Idempotent. */
  end: (key: string) => void;
  /** True while at least one source is busy (drives the bar itself). */
  anyBusy: boolean;
};

const ActivityContext = createContext<ActivityValue | null>(null);

/** Reads the activity controls; throws outside the AppShell provider. */
export function useActivity(): ActivityValue {
  const value = useContext(ActivityContext);
  if (value === null) {
    throw new Error("useActivity must be used within the AppShellShell ActivityProvider");
  }
  return value;
}

/**
 * Reports a single boolean "busy" source (a transition pending, a refresh in
 * flight) into the shared activity bar via `begin`/`end`. Call it from a
 * component that owns the flag. No-ops while the flag is unchanged.
 */
export function useReportActivity(active: boolean, key: string) {
  const { begin, end } = useActivity();
  const prevRef = useRef(active);
  useEffect(() => {
    if (active === prevRef.current) return;
    prevRef.current = active;
    if (active) begin(key);
    else end(key);
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
 * every reporter/consumer (pages call `useActivity`); render the `<ActivityBar/>`
 * separately inside the AppShell header so the bar sits flush under it.
 */
export function ActivityProvider({ children }: { children: ReactNode }) {
  const refcount = useRef<Record<string, number>>({});
  const [anyBusy, setAnyBusy] = useState(false);

  const begin = useCallback((key: string) => {
    refcount.current[key] = (refcount.current[key] ?? 0) + 1;
    setAnyBusy(true);
  }, []);

  const end = useCallback((key: string) => {
    const next = (refcount.current[key] ?? 1) - 1;
    if (next <= 0) {
      delete refcount.current[key];
    } else {
      refcount.current[key] = next;
    }
    if (Object.keys(refcount.current).length === 0) {
      setAnyBusy(false);
    }
  }, []);

  const value = useMemo(() => ({ begin, end, anyBusy }), [begin, end, anyBusy]);

  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>;
}

/**
 * The bar itself — mount it inside `AppShell.Header`, flush at its bottom edge
 * (the CSS positions it `absolute; bottom: 0`, so it sits on the header's
 * bottom border with no margin/padding above it). A busy source must persist
 * `ACTIVITY_SHOW_DELAY_MS` before the bar pops in (quick warm loads never
 * show); once busy clears, it lingers a flat `ACTIVITY_MIN_HOLD_MS`, then the
 * class drops and CSS retracts/fades the strip instead of vanishing instantly.
 * Both transitions live in effects (never during render), so SSR renders are
 * unaffected.
 */
export function ActivityBar() {
  const { anyBusy: busy } = useActivity();
  // While the once-per-launch cold-start readiness machine is loading or
  // confirming, it owns the header's bottom strip (see ColdStartReadyBar) —
  // suppress the generic bar so two strips never share the same 4px slot. It
  // resumes normal duty once the machine reaches `done`.
  const { phase } = useColdStartReady();
  const [shown, setShown] = useState(false);
  const showTimer = useRef<number | null>(null);
  const holdTimer = useRef<number | null>(null);
  // Render gate mirrors the timer gate: while the cold-start machine is
  // loading/confirming it owns the strip, so even a `shown` state that outlived
  // the phase flip stays hidden until the machine reaches `done`.
  const visible = shown && phase !== "loading" && phase !== "ready";

  useEffect(() => {
    const ownsSlot = phase !== "loading" && phase !== "ready";
    if (!ownsSlot) return;

    if (busy) {
      // Rising edge (or busy returning mid-exit): cancel any pending hold and,
      // if the bar isn't shown yet, arm the show-delay timer.
      if (holdTimer.current !== null) {
        window.clearTimeout(holdTimer.current);
        holdTimer.current = null;
      }
      if (!shown && showTimer.current === null) {
        showTimer.current = window.setTimeout(() => {
          showTimer.current = null;
          setShown(true);
        }, ACTIVITY_SHOW_DELAY_MS);
      }
    } else {
      // Falling edge: cancel a still-pending show (the load ended before it
      // earned the bar — it never appears) and, if shown, arm the hold.
      if (showTimer.current !== null) {
        window.clearTimeout(showTimer.current);
        showTimer.current = null;
      }
      if (shown && holdTimer.current === null) {
        holdTimer.current = window.setTimeout(() => {
          holdTimer.current = null;
          setShown(false);
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
  }, [busy, shown, phase]);

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
