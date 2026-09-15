/**
 * Best-effort detection of a genuinely weak device, used to drop compositor-
 * bound motion (the `c2-low-end` CSS tier). Deliberately conservative — both
 * signals must be low — so capable phones are never mistaken for weak ones.
 *
 * Pure over the passed capability values so it can be unit-tested without a
 * browser (the caller reads `navigator`).
 */
export interface DeviceCapabilities {
  /** `navigator.hardwareConcurrency` (logical cores). */
  hardwareConcurrency?: number;
  /** `navigator.deviceMemory` (GiB, Chrome-only, rounded to powers of two). */
  deviceMemory?: number;
}

/** Both a low core count and low memory are required (see the module note). */
export function isLowEndDevice({ hardwareConcurrency, deviceMemory }: DeviceCapabilities): boolean {
  const lowCores =
    typeof hardwareConcurrency === "number" && hardwareConcurrency > 0 && hardwareConcurrency <= 4;
  const lowMemory = typeof deviceMemory === "number" && deviceMemory > 0 && deviceMemory <= 4;
  return lowCores && lowMemory;
}
