"use client";

import { useEffect, useState, type ReactNode } from "react";

import { LoadingStatus } from "@/components/LoadingStatus";
import { useMotion } from "@/components/MotionProvider";

interface CrossfadeSwapProps {
  /** True while the skeleton is the real loading state. */
  loading: boolean;
  /** The skeleton to dissolve once the content lands. */
  skeleton: ReactNode;
  /** Screen-reader announcement while loading (never during the dissolve). */
  label?: string;
  /** Fill the bounded flex column (`Month` fit-to-height / `Month & Agenda`). */
  fill?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Skeleton → content crossfade for the dashboard grids
 * (docs/loading-transitions.md §1.6).
 *
 * The skeleton stays mounted for one motion beat after `loading` flips false,
 * fading out over the already-painted content, so the swap reads as a
 * dissolve instead of a hard cut. Both layers share one grid cell, so the
 * content owns the final layout and the skeleton never changes the box size
 * after the crossfade finishes.
 *
 * The load edge is adjusted during render (the same pattern as the dashboard's
 * optimistic chrome), so the retained skeleton is committed in the same pass as
 * the content and the reveal frame never shows an uncovered cut.
 * Reduced-motion / low-end users skip the retention window.
 */
export function CrossfadeSwap({
  loading,
  skeleton,
  label,
  fill = false,
  className,
  children,
}: CrossfadeSwapProps) {
  const motion = useMotion();
  const [leaving, setLeaving] = useState(false);
  const [prevLoading, setPrevLoading] = useState(loading);

  if (prevLoading !== loading) {
    setPrevLoading(loading);
    setLeaving(!loading && !prefersInstantSwap() && motion.duration.standard > 0);
  }

  useEffect(() => {
    if (!leaving || loading) {
      return;
    }
    const timer = window.setTimeout(() => setLeaving(false), motion.duration.standard);
    return () => window.clearTimeout(timer);
  }, [leaving, loading, motion.duration.standard]);

  const showSkeleton = loading || leaving;

  return (
    <div
      className={["c2-crossfade-stack", fill ? "c2-crossfade-stack--fill" : null, className]
        .filter(Boolean)
        .join(" ")}
    >
      {showSkeleton ? (
        <div
          className="c2-crossfade-layer c2-crossfade-skeleton"
          data-leaving={leaving && !loading ? "" : undefined}
          aria-hidden
        >
          {skeleton}
        </div>
      ) : null}
      {!loading ? <div className="c2-crossfade-layer c2-crossfade-content">{children}</div> : null}
      {loading && label ? <LoadingStatus label={label} /> : null}
    </div>
  );
}

function prefersInstantSwap(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  return (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.classList.contains("c2-low-end")
  );
}
