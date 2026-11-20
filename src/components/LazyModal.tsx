"use client";

import type { ReactNode } from "react";
import type { ModalProps } from "@mantine/core";

import { CrossfadeSwap } from "./CrossfadeSwap";
import { MotionModal } from "./MotionModal";
import { MIN_SKELETON_HOLD_MS } from "@/lib/loading/minHoldLoading";

export interface LazyModalProps {
  opened: boolean;
  onClose: () => void;
  title: ReactNode;
  size?: ModalProps["size"];
  transitionProps?: ModalProps["transitionProps"];
  /** The lazy body's chunk has arrived. */
  ready: boolean;
  /** An extra pending gate (e.g. a detail read on top of the chunk). */
  pending?: boolean;
  skeleton: ReactNode;
  children: ReactNode;
  keepMounted?: boolean;
  zIndex?: number;
  /** Accessible label for the close button. */
  closeLabel?: string;
  modalStyles?: ModalProps["styles"];
  swapClassName?: string;
  contentClassName?: string;
  minHoldMs?: number;
}

/**
 * The app's standard lazy-modal composition (docs/loading-transitions.md
 * §1.15.1): the `MotionModal` chrome is always mounted, the body arrives as an
 * already-created module-level `dynamic()` component, and the chunk gate
 * dissolves through `CrossfadeSwap` instead of `dynamic`'s hard-cut fallback.
 *
 * `dynamic()` must stay at the call site's module scope — this component never
 * creates one, so the chunk split is preserved.
 */
export function LazyModal({
  opened,
  onClose,
  title,
  size,
  transitionProps,
  ready,
  pending = false,
  skeleton,
  children,
  keepMounted,
  zIndex,
  closeLabel,
  modalStyles,
  swapClassName,
  contentClassName,
  minHoldMs = MIN_SKELETON_HOLD_MS,
}: LazyModalProps) {
  return (
    <MotionModal
      opened={opened}
      onClose={onClose}
      title={title}
      centered
      size={size}
      transitionProps={transitionProps}
      keepMounted={keepMounted}
      zIndex={zIndex}
      styles={modalStyles}
      closeButtonProps={closeLabel ? { "aria-label": closeLabel } : undefined}
    >
      <CrossfadeSwap
        loading={opened && (!ready || pending)}
        minHoldMs={minHoldMs}
        mode="overlay"
        animateHeight
        skeleton={skeleton}
        className={swapClassName}
        contentClassName={contentClassName}
      >
        {children}
      </CrossfadeSwap>
    </MotionModal>
  );
}
