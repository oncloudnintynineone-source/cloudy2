/**
 * Pure formatter that renders a Google Calendar event title from an
 * admin-defined template. Kept free of I/O so it can be unit-tested without a
 * database. People arrive pre-resolved (all three name styles filled in) so
 * the formatter only performs string substitution.
 */

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
  /** Invited personnel, in form order. */
  people: EventTitlePerson[];
  /** Invited department names, in form order. */
  departments: string[];
}

/**
 * Substitute every `{...}` token in the template (case-insensitive):
 * `{description}`, `{type}` / `{type:acronym}`, `{departments}`, and `{people}` /
 * `{people:full}` / `{people:acronym}` / `{people:fqn}` (bare `{people}` is the
 * FQN style). List tokens are joined with `", "`; empty lists/absent values
 * resolve to an empty string (no gap-collapsing), unknown tokens and unknown
 * styles are left as literal text, and the final result is trimmed.
 */
export function formatEventTitle(input: EventTitleInput, template: string): string {
  const peopleByStyle = (style: "full" | "acronym" | "fqn"): string =>
    input.people.map((person) => person[style]).join(", ");

  return template
    .replace(/\{([^}:]+)(?::([^}]+))?\}/g, (match, rawToken: string, rawStyle?: string) => {
      const token = rawToken.trim().toLowerCase();
      const style = rawStyle?.trim().toLowerCase();
      switch (token) {
        case "description":
          return input.description;
        case "type": {
          if (input.eventType === null) {
            return "";
          }
          if (style === undefined) {
            return input.eventType.name;
          }
          if (style === "acronym") {
            return input.eventType.acronym || input.eventType.name;
          }
          return match;
        }
        case "people": {
          if (style === undefined || style === "fqn") {
            return peopleByStyle("fqn");
          }
          if (style === "full") {
            return peopleByStyle("full");
          }
          if (style === "acronym") {
            return peopleByStyle("acronym");
          }
          return match;
        }
        case "departments":
          return input.departments.join(", ");
        default:
          return match;
      }
    })
    .trim();
}
