import type { MantineColor } from "@mantine/core";

/**
 * Pure helpers for department (calendar) event colors. Kept free of I/O so
 * they can be unit-tested without a database.
 *
 * An event renders in the color of its department calendar. The color is
 * admin-configurable from Settings → Departments (fixed palette); an unset
 * (null) color falls back to the calendar's deterministic default, which is
 * derived from the calendar id so it is stable across sessions and views.
 */

/** The fixed palette of selectable department colors. */
export const CALENDAR_COLORS: readonly MantineColor[] = [
  "blue",
  "green",
  "red",
  "violet",
  "orange",
  "cyan",
  "grape",
  "teal",
  "yellow",
  "pink",
];

export function isCalendarColor(value: unknown): value is MantineColor {
  return typeof value === "string" && (CALENDAR_COLORS as readonly string[]).includes(value);
}

/**
 * Normalize an admin-picked department color. Empty, "auto", or an unknown
 * value yields null ("use the calendar's deterministic default").
 */
export function normalizeCalendarColor(raw: unknown): MantineColor | null {
  if (raw === null || raw === undefined || raw === "") {
    return null;
  }
  if (typeof raw !== "string" || raw === "auto") {
    return null;
  }
  return isCalendarColor(raw) ? raw : null;
}

/**
 * The deterministic default color for a calendar: the calendar id hashed
 * onto the palette. Stable for a given id.
 */
export function colorForCalendar(calendarId: string): MantineColor {
  let hash = 0;
  for (let i = 0; i < calendarId.length; i += 1) {
    hash = (hash * 31 + calendarId.charCodeAt(i)) >>> 0;
  }
  return CALENDAR_COLORS[hash % CALENDAR_COLORS.length];
}

/** The color a calendar's events render with: the pinned color or the default. */
export function effectiveCalendarColor(calendarId: string, color: string | null): MantineColor {
  return normalizeCalendarColor(color) ?? colorForCalendar(calendarId);
}
