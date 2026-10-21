"use client";

import { Modal, type ModalProps } from "@mantine/core";

import { useMotion } from "@/components/MotionProvider";
import { fadeTransitionProps } from "@/lib/motion/transitions";

/**
 * Plain `<Modal>` that follows the active `motionProfile` by default: a fade +
 * small scale whose enter uses the profile's `pop` curve (playful overshoots)
 * and whose exit uses the non-bouncy `out` curve. Surfaces that need a
 * grow-from-trigger transition keep using `<Modal>` with
 * `modalZoomTransitionProps` / `modalFormTransitionProps`; an explicit
 * `transitionProps` prop always wins here too.
 */
export function MotionModal({ transitionProps, ...props }: ModalProps) {
  const motion = useMotion();
  return <Modal {...props} transitionProps={transitionProps ?? fadeTransitionProps(motion)} />;
}
