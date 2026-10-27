"use client";

import { useEffect, useState, type ReactNode } from "react";

import { LoadingStatus } from "@/components/LoadingStatus";
import { useMotion } from "@/components/MotionProvider";
import { useMinSkeletonHold } from "@/lib/loading/minHoldLoading";

interface CrossfadeSwapProps {
  /** True while the skeleton is the real loading state. */
  loading: boolean;
  /** The skeleton to dissolve once the content lands. */
  skeleton: ReactNode;
  /** Screen-reader announcement while loading (never during the dissolve). */
  label?: string;
  /** Fill the bounded flex column (`Month` fit-to-height / `Month & Agenda`). */
  fill?: boolean;
  /**
   * Minimum time the skeleton stays up once `loading` turns true (the shared
   * `MIN_SKELETON_HOLD_MS` value when callers want the standard beat). The
   * hold runs *inside* the swap so a warm load can't flash the skeleton and
   * hard-cut; callers whose `loading` is already held (the dashboard grid)
   * leave this at 0.
   */
  minHoldMs?: number;
  /**
   * `stack` (default) shares one grid cell between the layers — right for
   * bounded/fill surfaces where both layers match the final box. `overlay`
   * keeps the skeleton in flow while loading, then absolutely covers the
   * mounted content during the dissolve — right for modals and detail bodies
   * where the content's height is only known when it lands (no max-height
   * beat, no end-of-dissolve snap).
   */
  mode?: "stack" | "overlay";
  className?: string;
  /** Extra class on the content layer (the skeleton layer stays bare). */
  contentClassName?: string;
  children: ReactNode;
}

/**
 * Skeleton → content crossfade (docs/loading-transitions.md §1.6).
 *
 * The skeleton stays mounted for one motion beat after `loading` flips false,
 * fading out over the already-painted content, so the swap reads as a
 * dissolve instead of a hard cut. The load edge is adjusted during render (the
 * same pattern as the dashboard's optimistic chrome), so the retained skeleton
 * is committed in the same pass as the content and the reveal frame never
 * shows an uncovered cut. Reduced-motion / low-end users skip the retention
 * window.
 */
export function CrossfadeSwap({
  loading,
  skeleton,
  label,
  fill = false,
  minHoldMs = 0,
  mode = "stack",
  className,
  contentClassName,
  children,
}: CrossfadeSwapProps) {
  const motion = useMotion();
  const held = useMinSkeletonHold(loading, minHoldMs);
  const [leaving, setLeaving] = useState(false);
  const [prevLoading, setPrevLoading] = useState(held);

  if (prevLoading !== held) {
    setPrevLoading(held);
    setLeaving(!held && !prefersInstantSwap() && motion.duration.standard > 0);
  }

  useEffect(() => {
    if (!leaving || held) {
      return;
    }
    const timer = window.setTimeout(() => setLeaving(false), motion.duration.standard);
    return () => window.clearTimeout(timer);
  }, [leaving, held, motion.duration.standard]);

  const showSkeleton = held || leaving;

  return (
    <div
      className={[
        "c2-crossfade-stack",
        fill ? "c2-crossfade-stack--fill" : null,
        mode === "overlay" ? "c2-crossfade-stack--overlay" : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {showSkeleton ? (
        <div
          className="c2-crossfade-layer c2-crossfade-skeleton"
          data-leaving={leaving && !held ? "" : undefined}
          aria-hidden
        >
          {skeleton}
        </div>
      ) : null}
      {!held ? (
        <div
          className={["c2-crossfade-layer", "c2-crossfade-content", contentClassName]
            .filter(Boolean)
            .join(" ")}
        >
          {children}
        </div>
      ) : null}
      {held && label ? <LoadingStatus label={label} /> : null}
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
