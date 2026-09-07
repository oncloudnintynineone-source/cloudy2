/**
 * Pure helper that renders the final Google Calendar event title (summary)
 * from the event form's raw description plus the resolved title context. This
 * is the single source of truth for the title written to Google AND the title
 * recorded in audit snapshots, so the two can never diverge. Kept free of I/O
 * so it is unit-testable without a database or Google credentials.
 */

import {
  formatEventTitle,
  type EventTitlePerson,
  type EventTitleType,
} from "@/lib/settings/formatEventTitle";
import { type AmPm, type TimeOption } from "./timeOptions";

export interface RenderEventTitleInput {
  /** The raw description typed into the event form. */
  description: string;
  /** Event type name + shortname, or null when the event has none. */
  eventType: EventTitleType | null;
  /** Participant names, in form order (the organizer only when self-invited). */
  people: EventTitlePerson[];
  /** Tagged department names, in form order. */
  departments: string[];
  /** The event's location; "" when unset. */
  location: string;
  /** The admin-defined event title template. */
  template: string;
  timeOption: TimeOption;
  /** Start time as HH:MM (24h) for range events; "" for full/half. */
  startTime: string;
  /** End time as HH:MM (24h) for range events; "" for full/half. */
  endTime: string;
  startAmPm: AmPm;
  endAmPm: AmPm;
}

/**
 * Render the event's Google summary: substitute the template tokens, fall
 * back to the raw description when the template renders nothing (which may
 * itself be empty, producing an intentionally untitled event). Half-day
 * AM/PM markers come from the `{time}` token in the template, never a
 * hardcoded suffix. Legacy full-day events may still carry markers in their
 * stored Google title — those are read back as-is and never re-rendered here.
 */
export function renderEventTitle(input: RenderEventTitleInput): string {
  const rawTitle = input.description.trim();
  const renderedTitle = formatEventTitle(
    {
      description: rawTitle,
      eventType: input.eventType,
      people: input.people,
      departments: input.departments,
      location: input.location,
      timeOption: input.timeOption,
      startTime: input.startTime,
      endTime: input.endTime,
      startAmPm: input.startAmPm,
      endAmPm: input.endAmPm,
    },
    input.template,
  );
  return renderedTitle || rawTitle;
}
