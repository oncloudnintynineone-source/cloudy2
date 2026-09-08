/**
 * Pure formatter that renders a Google Calendar event title from an
 * admin-defined template. Kept free of I/O so it can be unit-tested without a
 * database. People arrive pre-resolved (all three name styles filled in) so
 * the formatter only performs string substitution.
 *
 * The token grammar (conditional groups `<...>`, escapes, unknown-token
 * pass-through) lives in the shared engine `tokenTemplate.ts`; this module
 * only supplies the event-title token resolver.
 */

import { renderTokenTemplate, type TokenTemplateResolver } from "./tokenTemplate";

export interface EventTitlePerson {
  /** Plain user name. */
  full: string;
  /** User shortname (acronym); callers fall back to the plain name when blank. */
  acronym: string;
  /** Fully qualified name via the display-name template. */
  fqn: string;
}

export interface EventTitleType {
  /** Event type name (renders bare `{type}`). */
  name: string;
  /** Event type shortname (acronym); callers fall back to the name when blank. */
  acronym: string;
}

export interface EventTitleInput {
  /** The raw description the user typed into the event form. */
  description: string;
  /** Event type name + shortname, or null when the event has none. */
  eventType: EventTitleType | null;
  /** Participant names, in form order (the organizer only when self-invited). */
  people: EventTitlePerson[];
  /** Tagged department names, in form order. */
  departments: string[];
  /** The event's location; "" when unset (out-of-camp events are always ""). */
  location: string;
  /** The event's time option: "range", "full", or "half". */
  timeOption: "range" | "full" | "half";
  /** Start time as HH:MM (24h) for range events; "" for full/half. */
  startTime: string;
  /** End time as HH:MM (24h) for range events; "" for full/half. */
  endTime: string;
  /** Start half-of-day indicator for half-day events. */
  startAmPm: "AM" | "PM" | "";
  /** End half-of-day indicator for half-day events. */
  endAmPm: "AM" | "PM" | "";
}

/**
 * Resolve one event-title token. Known tokens return their substituted value
 * (an empty string when the underlying field is blank); unknown tokens and
 * unknown styles return null so the shared engine keeps them literal.
 */
const eventTitleResolver = (input: EventTitleInput): TokenTemplateResolver => {
  return (token, style) => {
    if (token === "description") {
      return style === undefined ? input.description : null;
    }
    if (token === "type") {
      if (input.eventType === null) {
        return style === undefined || style === "acronym" ? "" : null;
      }
      if (style === undefined) {
        return input.eventType.name;
      }
      if (style === "acronym") {
        return input.eventType.acronym || input.eventType.name;
      }
      return null;
    }
    if (token === "people") {
      if (input.people.length === 0) {
        return style === undefined || style === "fqn" || style === "full" || style === "acronym"
          ? ""
          : null;
      }
      if (style === undefined || style === "fqn") {
        return input.people.map((person) => person.fqn).join(", ");
      }
      if (style === "full") {
        return input.people.map((person) => person.full).join(", ");
      }
      if (style === "acronym") {
        return input.people.map((person) => person.acronym).join(", ");
      }
      return null;
    }
    if (token === "departments") {
      return style === undefined ? input.departments.join(", ") : null;
    }
    if (token === "location") {
      return style === undefined ? input.location : null;
    }
    if (token === "time") {
      if (style !== undefined) {
        return null;
      }
      if (input.timeOption === "range" && input.startTime && input.endTime) {
        return `${input.startTime}-${input.endTime}`;
      }
      if (input.timeOption === "half") {
        return input.startAmPm || "";
      }
      return "";
    }
    return null;
  };
};

/**
 * Substitute every `{...}` token in the template (case-insensitive):
 * `{description}`, `{type}` / `{type:acronym}`, `{departments}`, `{location}`,
 * `{time}`, and `{people}` / `{people:full}` / `{people:acronym}` /
 * `{people:fqn}` (bare `{people}` is the FQN style). List tokens are joined
 * with `", "`; empty lists/absent values resolve to an empty string, unknown
 * tokens and unknown styles are left as literal text, and the final result is
 * trimmed. `{time}` renders as `HH:MM-HH:MM` for range events, `AM`/`PM` for
 * half-day events, or an empty string for full-day events.
 *
 * Conditional groups `<...>` (nestable, escape with `\`) render their inner
 * content only when at least one token inside (OR) resolves to non-empty.
 * Groups with no tokens at all are treated as literal `<...>` text.
 */
export function formatEventTitle(input: EventTitleInput, template: string): string {
  return renderTokenTemplate(template, eventTitleResolver(input)).trim();
}
