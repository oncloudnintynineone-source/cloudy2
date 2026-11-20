"use client";

import type { MantineSize } from "@mantine/core";
import { useMediaQuery, useViewportSize } from "@mantine/hooks";

import { useMotion } from "@/components/MotionProvider";
import { modalContentWidth, type Rect, type ViewportSize } from "@/lib/motion/origin";
import { modalZoomTransitionProps } from "@/lib/motion/transitions";
import { DESKTOP_MEDIA_QUERY, NARROW_MEDIA_QUERY } from "@/lib/theme";

/** Mantine's default modal content widths, in px. */
export const MODAL_SIZE_PX: Record<MantineSize, number> = {
  xs: 320,
  sm: 380,
  md: 440,
  lg: 620,
  xl: 780,
};

export interface ModalSizeSpec {
  /** Smallest tier (very small phones); defaults to `mobile`. */
  narrow?: MantineSize;
  mobile: MantineSize;
  desktop: MantineSize;
}

export interface ModalBreakpointFlags {
  isNarrow: boolean;
  isDesktop: boolean;
}

/** Pure resolution of the responsive modal size. */
export function resolveModalSize(
  spec: ModalSizeSpec,
  flags: ModalBreakpointFlags,
): MantineSize {
  if (flags.isNarrow) {
    return spec.narrow ?? spec.mobile;
  }
  return flags.isDesktop ? spec.desktop : spec.mobile;
}

/** Responsive modal size, without the zoom-origin plumbing. */
export function useModalSize(spec: ModalSizeSpec): MantineSize {
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);
  const isNarrow = useMediaQuery(NARROW_MEDIA_QUERY);
  return resolveModalSize(spec, { isDesktop, isNarrow });
}

export interface ModalZoomOptions {
  originRect: Rect | null;
  spec: ModalSizeSpec;
  /** Captured viewport (the dashboard captures it at open); else measured live. */
  viewport?: ViewportSize;
  /**
   * Content width override per tier, for dialogs whose shrink target differs
   * from the modal's own size (e.g. the compact date picker).
   */
  contentWidthPx?: Partial<Record<"narrow" | "mobile" | "desktop", number>>;
  fallbackOrigin?: string;
  scaleFallback?: number;
}

/**
 * The "grow out of / shrink back into the trigger" modal setup: responsive
 * size, viewport, content width and the shared transition props, all from one
 * call. The pure math stays in `src/lib/motion/origin.ts`.
 */
export function useModalZoom({
  originRect,
  spec,
  viewport: fixedViewport,
  contentWidthPx,
  fallbackOrigin,
  scaleFallback,
}: ModalZoomOptions): {
  size: MantineSize;
  transitionProps: ReturnType<typeof modalZoomTransitionProps>;
} {
  const motion = useMotion();
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);
  const isNarrow = useMediaQuery(NARROW_MEDIA_QUERY);
  const measured = useViewportSize();
  const viewport = fixedViewport ?? { w: measured.width, h: measured.height };

  const size = resolveModalSize(spec, { isDesktop, isNarrow });
  const tier = isNarrow ? "narrow" : isDesktop ? "desktop" : "mobile";
  const contentWidth =
    contentWidthPx?.[tier] ?? modalContentWidth(viewport, MODAL_SIZE_PX[size]);
  const transitionProps = modalZoomTransitionProps(
    motion,
    originRect,
    viewport,
    contentWidth,
    fallbackOrigin,
    scaleFallback,
  );
  return { size, transitionProps };
}
