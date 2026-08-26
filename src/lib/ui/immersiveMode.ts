import { createContext, useContext } from "react";

/**
 * Immersive ("fullscreen") mode for the Calendar view: the shell hides its
 * header, bottom nav and desktop sidebar while the browser/page goes
 * fullscreen (the OS status bar goes with it where the Fullscreen API is
 * supported). The AppShell owns the state (it has to, since it renders the
 * chrome being hidden); pages opt in by calling `enter`/`exit` through
 * `useImmersiveMode()` and must exit on unmount.
 */
export interface ImmersiveModeValue {
  /** True while the shell is in immersive mode. */
  active: boolean;
  /**
   * Enters immersive mode: flips the shell chrome off and requests the
   * page-level Fullscreen API (hides the status bar / browser UI on the
   * devices that support it). A browser that rejects or lacks the API
   * (e.g. iOS) still gets the CSS-only focus mode.
   */
  enter: () => void;
  /** Exits immersive mode and leaves the Fullscreen API state too. Idempotent. */
  exit: () => void;
}

export const ImmersiveModeContext = createContext<ImmersiveModeValue | null>(null);

/** Reads the immersive-mode controls; throws outside the AppShell provider. */
export function useImmersiveMode(): ImmersiveModeValue {
  const value = useContext(ImmersiveModeContext);
  if (value === null) {
    throw new Error("useImmersiveMode must be used within the AppShellShell provider");
  }
  return value;
}
