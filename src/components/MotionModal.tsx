"use client";

import { Modal, type ModalProps } from "@mantine/core";

import { useMotion } from "@/components/MotionProvider";
import { fadeTransitionProps } from "@/lib/motion/transitions";
import { useEnterTransitionReady } from "@/lib/motion/useEnterTransitionReady";

/**
 * The app's single standalone-modal renderer. It follows the active
 * `motionProfile` by default (a fade + small scale whose enter uses the
 * profile's `pop` curve and whose exit uses the non-bouncy `out` curve), and it
 * defers a first-mount-open modal one frame so Mantine's `Transition` starts
 * closed instead of already `entered`. That guard matters for lazily imported
 * or conditionally mounted dialogs, which would otherwise skip their entrance
 * animation. Callers that grow from a trigger pass their own
 * `modalZoomTransitionProps` / `modalFormTransitionProps`; an explicit
 * `transitionProps` always wins here.
 *
 * Never render Mantine's raw `<Modal>` directly for a standalone dialog — use
 * this component. The only exception is a compound `Modal.Root`, which must
 * pass its `opened` value through `useEnterTransitionReady` itself.
 */
export function MotionModal({ transitionProps, opened, ...props }: ModalProps) {
  const motion = useMotion();
  const enterReady = useEnterTransitionReady(opened === true);
  return (
    <Modal
      {...props}
      opened={opened === true && enterReady}
      transitionProps={transitionProps ?? fadeTransitionProps(motion)}
    />
  );
}
