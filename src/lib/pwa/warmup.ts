/**
 * Gate for the post-paint route/view chunk warm-up (Phase B/C). Warming is a
 * network + memory cost paid on every launch to remove a chunk download from
 * the first page/view switch, so it is skipped on connections that would feel
 * the cost: metered (`saveData`) and very slow (`slow-2g`/`2g`) links, and while
 * offline. Low-end devices are deliberately NOT excluded — they have the most to
 * gain from a faster switch — but they still respect the connection signals.
 *
 * `shouldWarmRoutes` is pure over the passed capability values so it can be
 * unit-tested without a browser; `canWarmRoutes` reads `navigator` at the call
 * site.
 */

import { isLowEndDevice } from "@/lib/motion/lowEndDevice";

export interface WarmupCapabilities {
  /** `navigator.connection.saveData` (data-saver mode). */
  saveData?: boolean;
  /** `navigator.connection.effectiveType` — "slow-2g" | "2g" | "3g" | "4g". */
  effectiveType?: string;
  /** `navigator.onLine`. */
  onLine?: boolean;
}

const SLOW_EFFECTIVE_TYPES = new Set(["slow-2g", "2g"]);

/**
 * Whether to warm route/view chunks. Missing signals (browsers without
 * `navigator.connection`) are treated as capable — the connection API is
 * Chromium-only, and assuming "no signal" means "slow" would disable the
 * warm-up on every iOS/Safari device.
 */
export function shouldWarmRoutes({ saveData, effectiveType, onLine }: WarmupCapabilities): boolean {
  if (onLine === false) return false;
  if (saveData === true) return false;
  if (effectiveType && SLOW_EFFECTIVE_TYPES.has(effectiveType)) return false;
  return true;
}

/** `shouldWarmRoutes` with the current browser's capabilities (SSR-safe). */
export function canWarmRoutes(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  };
  return shouldWarmRoutes({
    saveData: nav.connection?.saveData,
    effectiveType: nav.connection?.effectiveType,
    onLine: nav.onLine,
  });
}

/**
 * Gate for the dashboard's all-tab data preload — heavier than the chunk
 * warm-up (it costs a server read plus an IndexedDB write per tab). Skipped on
 * weak devices (bounded RAM/CPU) *and* constrained connections; the active tab
 * is always loaded, and any other tab fetches on demand.
 */
export interface TabPreloadCapabilities extends WarmupCapabilities {
  hardwareConcurrency?: number;
  deviceMemory?: number;
}

export function shouldPreloadTabs(caps: TabPreloadCapabilities): boolean {
  if (
    isLowEndDevice({
      hardwareConcurrency: caps.hardwareConcurrency,
      deviceMemory: caps.deviceMemory,
    })
  ) {
    return false;
  }
  return shouldWarmRoutes(caps);
}

/** `shouldPreloadTabs` with the current browser's capabilities (SSR-safe). */
export function canPreloadTabs(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
    deviceMemory?: number;
  };
  return shouldPreloadTabs({
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemory: nav.deviceMemory,
    saveData: nav.connection?.saveData,
    effectiveType: nav.connection?.effectiveType,
    onLine: nav.onLine,
  });
}
