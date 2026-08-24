import type { MantineColor } from "@mantine/core";

/**
 * Pure helpers for event colors. Kept free of I/O so they can be unit-tested
 * without a database.
 *
 * Typed events render in the color of their event type: an admin-pinned color
 * (Settings → Event Types, fixed palette) or — when unset — a deterministic
 * default derived from the type name. Untyped/external events (created
 * directly in Google) fall back to the department calendar's color: a pinned
 * color or a deterministic default derived from the calendar id.
 */

/** The fixed palette of selectable event colors. */
export const EVENT_COLORS: readonly MantineColor[] = [
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

export function isEventColor(value: unknown): value is MantineColor {
  return typeof value === "string" && (EVENT_COLORS as readonly string[]).includes(value);
}

/**
 * Normalize an admin-picked event color. Empty, "auto", or an unknown value
 * yields null ("use the deterministic default").
 */
export function normalizeEventColor(raw: unknown): MantineColor | null {
  if (raw === null || raw === undefined || raw === "") {
    return null;
  }
  if (typeof raw !== "string" || raw === "auto") {
    return null;
  }
  return isEventColor(raw) ? raw : null;
}

/**
 * The deterministic default color for an id (an event type name or a
 * calendar id): the id hashed onto the palette. Stable for a given id.
 */
export function colorForId(id: string): MantineColor {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return EVENT_COLORS[hash % EVENT_COLORS.length];
}

/** The color a typed event renders with: the type's pinned color or its default. */
export function effectiveEventTypeColor(typeName: string, color: string | null): MantineColor {
  return normalizeEventColor(color) ?? colorForId(typeName);
}

/** The color an untyped/external event renders with: the calendar's pinned color or its default. */
export function effectiveCalendarColor(calendarId: string, color: string | null): MantineColor {
  return normalizeEventColor(color) ?? colorForId(calendarId);
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Human-readable label for a stored color (settings lists, audit details):
 * the capitalized palette name, or "Auto (<default>)" when unset, where the
 * default is derived from autoRefId (the event type name or calendar id).
 */
export function formatColorLabel(color: string | null, autoRefId: string): string {
  const normalized = normalizeEventColor(color);
  if (normalized) {
    return capitalize(normalized);
  }
  return `Auto (${capitalize(colorForId(autoRefId))})`;
}
