/**
 * Touch haptics (docs/native-feel.md).
 *
 * A tiny wrapper over the Vibration API that gives key actions a native-feeling
 * tap. It is strictly best-effort: the Vibration API exists on Android Chrome
 * (including the installed WebAPK) and not at all on iOS Safari, so every call
 * degrades to a no-op there. The pattern table is pure and unit-tested; the
 * device gate and the user opt-out live in `haptic()`.
 *
 * Opt-out is device-local (`localStorage`) — a haptics preference is a property
 * of the phone in your hand, not the account — and defaults to enabled.
 */

import { useSyncExternalStore } from "react";

export type HapticKind = "light" | "medium" | "success" | "warning" | "error";

/**
 * Vibration patterns in ms (a number, or an on/off/on… array). Deliberately
 * short: haptics should register as feedback, never as a buzz.
 */
export const HAPTIC_PATTERNS: Record<HapticKind, number | number[]> = {
  light: 8,
  medium: 16,
  success: [10, 40, 10],
  warning: [16, 50, 16],
  error: [30, 40, 30],
};

/** The raw vibration pattern for a kind (pure; the testable core). */
export function hapticPattern(kind: HapticKind): number | number[] {
  return HAPTIC_PATTERNS[kind];
}

const HAPTICS_PREF_KEY = "cloudy2.haptics";
/** Window event fired when the preference changes, so subscribers re-render. */
export const HAPTICS_CHANGED_EVENT = "cloudy2:haptics-changed";

/** Whether haptics are enabled on this device (default: on). */
export function isHapticsEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(HAPTICS_PREF_KEY) !== "0";
  } catch {
    // Storage blocked (private mode): fall back to the default, on.
    return true;
  }
}

/** Persist the device-local haptics opt-out. */
export function setHapticsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(HAPTICS_PREF_KEY, enabled ? "1" : "0");
  } catch {
    // Storage blocked — the preference just won't persist.
  }
  window.dispatchEvent(new Event(HAPTICS_CHANGED_EVENT));
}

function subscribeHaptics(onChange: () => void): () => void {
  window.addEventListener(HAPTICS_CHANGED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(HAPTICS_CHANGED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** SSR snapshot: haptics default to on, so the menu row renders checked. */
function getServerHapticsSnapshot(): boolean {
  return true;
}

/**
 * The device-local haptics preference as reactive state, read through
 * `useSyncExternalStore` so the profile menu stays in sync without a
 * set-state-in-effect.
 */
export function useHapticsEnabled(): boolean {
  return useSyncExternalStore(subscribeHaptics, isHapticsEnabled, getServerHapticsSnapshot);
}

/**
 * Fire a haptic pulse of `kind`. No-op when the Vibration API is unavailable
 * (iOS), when the user has opted out, or when storage/`vibrate` throws.
 */
export function haptic(kind: HapticKind = "light"): void {
  if (typeof navigator === "undefined") {
    return;
  }
  const nav = navigator as Navigator & {
    vibrate?: (pattern: number | number[]) => boolean;
  };
  if (typeof nav.vibrate !== "function" || !isHapticsEnabled()) {
    return;
  }
  try {
    nav.vibrate(hapticPattern(kind));
  } catch {
    // Best-effort.
  }
}
