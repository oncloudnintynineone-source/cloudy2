/**
 * Pure helpers for the per-event-type "location policy" feature. An admin
 * restricts where events of a type may take place:
 *
 * - `in` ("In camp only") — the Out of Camp flag is forced off; the
 *   location field is cleared and disabled.
 * - `out` ("Out of camp only") — the Out of Camp flag is forced on; the
 *   location field is cleared.
 * - `both` (default, no restriction) — the user chooses freely.
 *
 * `clampOutOfCamp` is the single source of truth applied both client-side
 * (event form) and server-side (create/update actions), so a stale form
 * state can never submit an out-of-policy combination. Kept free of I/O so
 * the helpers are unit-testable without a database.
 */

export const LOCATION_POLICIES = ["in", "out", "both"] as const;

export type LocationPolicy = (typeof LOCATION_POLICIES)[number];

export const LOCATION_POLICY_LABELS: Record<LocationPolicy, string> = {
  in: "In camp only",
  out: "Out of camp only",
  both: "Both",
};

export const LOCATION_POLICY_DESCRIPTIONS: Record<LocationPolicy, string> = {
  in: "Events of this type take place in camp; no location is recorded.",
  out: "Events of this type take place out of camp; no location is recorded.",
  both: "The user may choose in camp or out of camp when creating the event.",
};

/** Whether a value is one of the canonical location policy ids. */
export function isLocationPolicy(value: unknown): value is LocationPolicy {
  return typeof value === "string" && (LOCATION_POLICIES as readonly string[]).includes(value);
}

/** Normalize an untrusted value to a valid policy; missing/unknown means "both". */
export function normalizeLocationPolicy(value: unknown): LocationPolicy {
  return isLocationPolicy(value) ? value : "both";
}

export interface OutOfCampState {
  outOfCamp: boolean;
  location: string;
}

/**
 * Enforce a type's location policy onto the event's Out of Camp flag and
 * location: "in" clears the location and forces the flag off, "out" forces
 * the flag on and clears the location, "both" passes the values through.
 */
export function clampOutOfCamp(
  policy: LocationPolicy,
  outOfCamp: boolean,
  location: string,
): OutOfCampState {
  if (policy === "in") {
    return { outOfCamp: false, location: "" };
  }
  if (policy === "out") {
    return { outOfCamp: true, location: "" };
  }
  return { outOfCamp, location };
}
