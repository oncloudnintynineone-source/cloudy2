/**
 * Pure helpers for per-event-type "location categories". An admin configures,
 * per event type, which of the three categories events of that type may take
 * place in (the "allowed locations" matrix). An event's location is a single
 * category selected from that allowlist:
 *
 * - `in` — in camp. No Out of Camp flag, no destination.
 * - `out` — out of camp but in country (the destination is recorded).
 * - `overseas` — out of the country (out of camp by implication; the
 *   destination is recorded). This is the only category that makes a tagged
 *   person "not in country" for the KAH check.
 *
 * The two stored flags derive from the category: `outOfCamp` is true for
 * `out` and `overseas`; `overseas` is true only for `overseas`. Legacy events
 * without the overseas flag in their notes parse as in-country.
 *
 * `clampOutOfCamp` is the single source of truth applied both client-side
 * (event form) and server-side (create/update actions), so a stale form
 * state can never submit an out-of-policy category. Kept free of I/O so the
 * helpers are unit-testable without a database.
 */

export const LOCATION_CATEGORIES = ["in", "out", "overseas"] as const;

export type LocationCategory = (typeof LOCATION_CATEGORIES)[number];

export const LOCATION_CATEGORY_LABELS: Record<LocationCategory, string> = {
  in: "In camp",
  out: "Out of camp",
  overseas: "Overseas",
};

export const LOCATION_CATEGORY_DESCRIPTIONS: Record<LocationCategory, string> = {
  in: "Events of this type take place in camp; no location is recorded.",
  out: "Events of this type take place out of camp but in country; the location records the destination.",
  overseas:
    "Events of this type take place outside the country; the location records the overseas destination.",
};

/** Whether a value is one of the canonical location category ids. */
export function isLocationCategory(value: unknown): value is LocationCategory {
  return typeof value === "string" && (LOCATION_CATEGORIES as readonly string[]).includes(value);
}

/** All categories, in canonical order. */
export const ALL_LOCATION_CATEGORIES: LocationCategory[] = [...LOCATION_CATEGORIES];

/** The default allowlist (every category) when a type has no restriction. */
export function defaultAllowedLocations(): LocationCategory[] {
  return [...ALL_LOCATION_CATEGORIES];
}

/**
 * Normalize an untrusted value into a non-empty allowlist: dedupe, drop
 * unknown categories, and fall back to all categories when nothing valid
 * remains (or the value isn't an array).
 */
export function normalizeAllowedLocations(value: unknown): LocationCategory[] {
  if (!Array.isArray(value)) {
    return defaultAllowedLocations();
  }
  const unique = [...new Set(value.filter(isLocationCategory))];
  return unique.length > 0 ? unique : defaultAllowedLocations();
}

/** The category an event falls into given its stored flags. */
export function categoryFromFlags(outOfCamp: boolean, overseas: boolean): LocationCategory {
  if (overseas && outOfCamp) {
    return "overseas";
  }
  if (outOfCamp) {
    return "out";
  }
  return "in";
}

/** The stored flags a category implies. */
export function flagsFromCategory(category: LocationCategory): {
  outOfCamp: boolean;
  overseas: boolean;
} {
  switch (category) {
    case "in":
      return { outOfCamp: false, overseas: false };
    case "out":
      return { outOfCamp: true, overseas: false };
    case "overseas":
      return { outOfCamp: true, overseas: true };
  }
}

/**
 * Clamp a category into the type's allowed set: when the current category
 * isn't allowed, fall back to the first allowed category (canonical order);
 * an empty/non-array allowlist means "everything", and the `in` category is
 * the terminal fallback so an empty allowed set still yields in-camp.
 */
export function clampLocationCategory(
  allowed: readonly LocationCategory[] | null | undefined,
  category: LocationCategory,
): LocationCategory {
  const allowedSet = new Set(normalizeAllowedLocations(allowed));
  if (allowedSet.has(category)) {
    return category;
  }
  return ALL_LOCATION_CATEGORIES.find((entry) => allowedSet.has(entry)) ?? "in";
}

export interface OutOfCampState {
  outOfCamp: boolean;
  overseas: boolean;
  location: string;
}

/**
 * Enforce a type's allowed locations onto the event's Out of Camp flag,
 * overseas flag, and location: a category outside the allowlist is clamped to
 * the first allowed one, and the location is cleared whenever the event is
 * not out of camp (in-camp events record no destination). Keeping the
 * overseas flag is what makes the event count a tagged person as away in the
 * KAH check.
 */
export function clampOutOfCamp(
  allowed: readonly LocationCategory[] | null | undefined,
  outOfCamp: boolean,
  overseas: boolean,
  location: string,
): OutOfCampState {
  const category = clampLocationCategory(allowed, categoryFromFlags(outOfCamp, overseas));
  const flags = flagsFromCategory(category);
  return {
    ...flags,
    location: flags.outOfCamp ? location : "",
  };
}
