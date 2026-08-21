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
import { amPmSuffix, type AmPm, type TimeOption } from "./timeOptions";

export interface RenderEventTitleInput {
  /** The raw description typed into the event form. */
  description: string;
  /** Event type name + shortname, or null when the event has none. */
  eventType: EventTitleType | null;
  /** Invited personnel, in form order. */
  people: EventTitlePerson[];
  /** Invited department names, in form order. */
  departments: string[];
  /** The event's location; "" when unset. */
  location: string;
  /** The admin-defined event title template. */
  template: string;
  timeOption: TimeOption;
  startAmPm: AmPm;
  endAmPm: AmPm;
}

/**
 * Render the event's Google summary: substitute the template tokens, fall
 * back to the raw description when the template renders nothing (which may
 * itself be empty, producing an intentionally untitled event), and append the
 * shared (AM)/(PM) marker for full-day events whose halves agree.
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
    },
    input.template,
  );
  const baseTitle = renderedTitle || rawTitle;
  const amPm = amPmSuffix(input.startAmPm, input.endAmPm);
  // An empty title gets no bare "(AM)" suffix.
  return baseTitle && input.timeOption === "full" && amPm ? `${baseTitle} (${amPm})` : baseTitle;
}
