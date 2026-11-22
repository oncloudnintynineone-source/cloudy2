"use server";

import { formatInstantToNaive, utcToDateString } from "@/lib/events/datetime";
import {
  mapCalendarItem,
  listCalendars,
  type CalendarEvent,
} from "@/lib/events/queries";
import type { EventRef } from "@/lib/events/targets";
import {
  parseEventRecurrence,
  parseEventPeople,
  parseEventRegistrationEnabled,
} from "@/lib/events/notes";
import {
  occurrenceIndex,
  parseRRule,
  recurrenceSummary,
  remainingRecurrence,
  type RecurrenceRule,
} from "@/lib/events/recurrence";
import { listEventTypes } from "@/lib/eventTypes/queries";
import { getGoogleIntegration, googleCalendarConfigured } from "@/lib/google";
import { resolveGoogleCalendarId } from "@/lib/roster/shares";
import { requireSession } from "@/lib/session";

export type SeriesPrefillScope = "series" | "following";

export type SeriesPrefillResult =
  | {
      ok: true;
      /** Series scope: a synthetic CalendarEvent for the parent copy. */
      event?: CalendarEvent;
      /** Following scope: the remaining rule the successor should start with. */
      recurrence?: RecurrenceRule | null;
    }
  | { ok: false; error: string; custom?: boolean };

function naiveStart(allDay: boolean, date: Date): string {
  return allDay ? `${utcToDateString(date)} 00:00:00` : formatInstantToNaive(date);
}

/**
 * Read-only prefill for the "All events" / "This and following" edit scopes.
 *
 * Google is the authority for the series start and rule; the notes mirror is a
 * fallback. External series (no app group id / no parseable rule) are refused
 * so the UI can fall back to "This event only" instead of silently replacing a
 * custom Google rule.
 */
export async function loadEventSeriesPrefill(
  ref: EventRef,
  scope: SeriesPrefillScope,
): Promise<SeriesPrefillResult> {
  await requireSession();
  if (!googleCalendarConfigured()) {
    return { ok: false, error: "Google Calendar is not configured" };
  }
  if (scope !== "series" && scope !== "following") {
    return { ok: false, error: "Invalid edit scope" };
  }
  if (!ref.recurringEventId) {
    return { ok: false, error: "This event is not part of a repeating series" };
  }
  try {
    const googleCalendarId = await resolveGoogleCalendarId(ref.calendarId);
    if (!googleCalendarId) {
      return { ok: false, error: "Calendar not found" };
    }
    const integration = await getGoogleIntegration();
    const parent = await integration.getEvent(googleCalendarId, ref.recurringEventId);
    if (!parent) {
      return { ok: false, error: "Could not find the repeating series" };
    }
    const people = parseEventPeople(parent.description);
    if (ref.eventId && people.eventId !== ref.eventId) {
      return { ok: false, error: "Could not find the repeating series" };
    }
    if (parseEventRegistrationEnabled(parent.description) && scope === "following") {
      return { ok: false, error: "Registration events are edited as a series" };
    }
    const rule =
      parseEventRecurrence(parent.description) ?? parseRRule(parent.recurrence).rule ?? null;
    if (!rule) {
      return {
        ok: false,
        custom: true,
        error:
          "This series was created outside the app or uses a custom repeat rule; edit this occurrence only.",
      };
    }
    const seriesStart = naiveStart(parent.allDay, parent.start);

    if (scope === "following") {
      const splitAt = ref.originalStartTime ?? null;
      if (!splitAt || occurrenceIndex(rule, seriesStart, splitAt) === null) {
        return { ok: false, error: "Could not resolve the occurrence to split at" };
      }
      return { ok: true, recurrence: remainingRecurrence(rule, seriesStart, splitAt) };
    }

    const [calendars, eventTypes] = await Promise.all([listCalendars(), listEventTypes()]);
    const calendar = calendars.find((row) => row.id === ref.calendarId);
    if (!calendar) {
      return { ok: false, error: "Calendar not found" };
    }
    const typeColors = new Map(eventTypes.map((row) => [row.name, row.color]));
    const mapped = mapCalendarItem(
      calendar,
      parent,
      { typeFilter: [], userFilter: [] },
      typeColors,
    );
    if (!mapped) {
      return { ok: false, error: "Could not read the repeating series" };
    }
    return {
      ok: true,
      event: {
        ...mapped,
        payload: {
          ...mapped.payload,
          recurrence: rule,
          recurrenceSummary: recurrenceSummary(rule, seriesStart),
          recurringEventId: null,
          originalStartTime: null,
          occurrenceOverride: false,
        },
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not read the repeating series",
    };
  }
}
