import { createContext, useContext } from "react";

import type { Rect } from "@/lib/motion/origin";

/**
 * Window event fired by client mutation flows (event create/update/delete) so
 * the shell's header count badge can refresh. Mirrors the existing
 * `cloudy2:session-expired` convention.
 */
export const PINNED_EVENTS_CHANGED_EVENT = "cloudy2:pinned-events-changed";

/**
 * Pinned Events panel for the Calendar: the shell owns the open/close state
 * (it renders the header button) and pages/panels read it through
 * `usePinnedPanel()`. Opening is a transient client state — never persisted.
 */
export interface PinnedPanelValue {
  /** True while the Pinned Events panel is open. */
  open: boolean;
  /** The header button's bounding rect at open time; the modal zooms out of /
   *  shrinks back into it (the app's standard grow/shrink animation). Null
   *  before the first open or when opened without a trigger. */
  originRect: Rect | null;
  /** Opens the panel (and navigates to the dashboard first when on another
   *  page), given the tapped trigger's rect for the zoom origin. */
  openPanel: (originRect: Rect | null) => void;
  /** Closes the panel. Idempotent. */
  closePanel: () => void;
}

export const PinnedPanelContext = createContext<PinnedPanelValue | null>(null);

/** Reads the Pinned Events panel controls; throws outside the AppShell provider. */
export function usePinnedPanel(): PinnedPanelValue {
  const value = useContext(PinnedPanelContext);
  if (value === null) {
    throw new Error("usePinnedPanel must be used within the AppShellShell provider");
  }
  return value;
}
