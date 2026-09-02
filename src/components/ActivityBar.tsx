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
 * Minimum continuous-busy time before the bar appears. A warm-cache route nav
 * or an in-page flip can resolve in well under this — the bar would flash and
 * read as jank, the exact problem `MIN_SKELETON_HOLD_MS` was built to avoid.
 * Only once busy has persisted past this threshold does the bar show.
 */
export const ACTIVITY_SHOW_DELAY_MS = 200;

/**
 * How long the bar lingers once busy clears, so a load that ends right at the
 * show threshold still reads as a deliberate, completed sequence rather than a
 * 1-frame blip.
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
 * bottom border with no margin/padding above it). Delayed show + min hold mean
 * a fast/warm load never makes it flicker.
 */
export function ActivityBar() {
  const { anyBusy: busy } = useActivity();
  const [show, setShow] = useState(false);
  const shownStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (busy) {
      shownStartRef.current = null;
      const timer = window.setTimeout(() => setShow(true), ACTIVITY_SHOW_DELAY_MS);
      return () => window.clearTimeout(timer);
    }
    if (!show) return;
    const shownAt = shownStartRef.current ?? performance.now();
    const remaining = ACTIVITY_MIN_HOLD_MS - (performance.now() - shownAt);
    if (remaining <= 0) {
      setShow(false);
      return;
    }
    const timer = window.setTimeout(() => setShow(false), remaining);
    return () => window.clearTimeout(timer);
  }, [busy, show]);

  // Record the moment the bar actually became visible so the min-hold stays
  // honest even when busy clears just after the show delay.
  useEffect(() => {
    if (show) {
      shownStartRef.current = performance.now();
    }
  }, [show]);

  return (
    <div
      className={show ? "c2-activity-bar c2-activity-bar-active" : "c2-activity-bar"}
      role="progressbar"
      aria-label="Loading"
      aria-hidden={!show}
      aria-valuemin={0}
      aria-valuemax={1}
    >
      <div className="c2-activity-bar-thumb" />
    </div>
  );
}
