/**
 * Structured "recipe" model for event-title templates. A recipe is an ordered
 * list of segments (the fields to include) — NOT free text — so emptiness can
 * never leave stray punctuation: a segment is shown only when its field has
 * content, wrappers/connectors are attached to their own segment, and a
 * connector only ever appears between two rendered segments (never leading or
 * trailing). Admin-tuned, so writing a template is picking fields + decoration
 * instead of hand-authoring `{token}< ... >` text.
 *
 * Kept free of I/O (DB-free, unit-testable). The segment FIELD values mirror
 * what the old event-title tokens rendered (see `renderTitleRecipe`), so the
 * output of a recipe equals the output of its hand-written equivalent.
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
  /** Event type name (renders bare). */
  name: string;
  /** Event type shortname (acronym); callers fall back to the name when blank. */
  acronym: string;
}

/** The event data a title recipe is rendered against. */
export interface EventTitleRecipeInput {
  /** The raw description the user typed into the event form. */
  description: string;
  /** Event type name + shortname, or null when the event has none. */
  eventType: EventTitleType | null;
  /** Participant names, in form order (the organizer only when self-invited). */
  people: EventTitlePerson[];
  /** Tagged department names, in form order. */
  departments: string[];
  /** The event's location; "" when unset. */
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
  /**
   * Optional pre-rendered wall-clock window (e.g. the audit "time" string with
   * its date). When set, a `time` segment renders this instead of the raw
   * HH:MM text — used by the push-notification bodies.
   */
  timeFull?: string;
}

// ---------------------------------------------------------------------------
// Recipe types
// ---------------------------------------------------------------------------

export const TITLE_RECIPE_FIELDS = [
  "type",
  "description",
  "people",
  "departments",
  "location",
  "time",
  "text",
] as const;
export type TitleRecipeField = (typeof TITLE_RECIPE_FIELDS)[number];

export const TITLE_FIELD_LABELS: Record<TitleRecipeField, string> = {
  type: "Event type",
  description: "Description",
  people: "People",
  departments: "Departments",
  location: "Location",
  time: "Time",
  text: "Text",
};

export const TITLE_TYPE_STYLES = ["name", "acronym"] as const;
export type TitleTypeStyle = (typeof TITLE_TYPE_STYLES)[number];

export const TITLE_PEOPLE_STYLES = ["fqn", "full", "acronym"] as const;
export type TitlePeopleStyle = (typeof TITLE_PEOPLE_STYLES)[number];

export const TITLE_RECIPE_WRAPPERS = ["none", "paren", "bracket"] as const;
export type TitleRecipeWrapper = (typeof TITLE_RECIPE_WRAPPERS)[number];

/** Connectors join this segment to the PREVIOUS rendered segment. */
export const TITLE_RECIPE_CONNECTORS = [
  "none",
  "space",
  "comma",
  "dash",
  "colon",
  "middot",
] as const;
export type TitleRecipeConnector = (typeof TITLE_RECIPE_CONNECTORS)[number];

export const TITLE_CONNECTOR_TEXT: Record<TitleRecipeConnector, string> = {
  none: "",
  space: " ",
  comma: ", ",
  dash: " \u2013 ",
  colon: ": ",
  middot: " \u00b7 ",
};

export const TITLE_RECIPE_MAX_SEGMENTS = 12;

export interface TitleRecipeSegment {
  /** The field this segment renders. */
  field: TitleRecipeField;
  /** Type style — only meaningful for a `type` segment. */
  typeStyle?: TitleTypeStyle;
  /** People style — only meaningful for a `people` segment. */
  peopleStyle?: TitlePeopleStyle;
  /** Literal words — only meaningful for a `text` segment. */
  text?: string;
  /** Wrap the rendered value in ( ) or [ ]; `none` (default) = no wrap. */
  wrapper?: TitleRecipeWrapper;
  /**
   * Text joining this segment to the NEXT rendered segment (unused after the
   * final rendered segment). Defaults to "none".
   */
  connector?: TitleRecipeConnector;
}

export interface TitleRecipe {
  /** Ordered segments; at least one, at most `TITLE_RECIPE_MAX_SEGMENTS`. */
  segments: TitleRecipeSegment[];
}

// ---------------------------------------------------------------------------
// Constants + sanitizer
// ---------------------------------------------------------------------------

/** The built-in default: render the raw description (like the old default `{description}`). */
export const DEFAULT_TITLE_RECIPE: TitleRecipe = { segments: [{ field: "description" }] };

const WRAPPER_TEXT: Record<TitleRecipeWrapper, [string, string]> = {
  none: ["", ""],
  paren: ["(", ")"],
  bracket: ["[", "]"],
};

const isField = (value: unknown): value is TitleRecipeField =>
  typeof value === "string" && (TITLE_RECIPE_FIELDS as readonly string[]).includes(value);

const isOneOf = <T extends string>(options: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (options as readonly string[]).includes(value);

function sanitizeSegment(raw: unknown): TitleRecipeSegment | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const segment = raw as Record<string, unknown>;
  if (!isField(segment.field)) {
    return null;
  }
  const out: TitleRecipeSegment = { field: segment.field };
  if (segment.field === "type" && isOneOf(TITLE_TYPE_STYLES, segment.typeStyle)) {
    out.typeStyle = segment.typeStyle;
  }
  if (segment.field === "people" && isOneOf(TITLE_PEOPLE_STYLES, segment.peopleStyle)) {
    out.peopleStyle = segment.peopleStyle;
  }
  if (segment.field === "text" && typeof segment.text === "string") {
    out.text = segment.text.trim();
  }
  if (isOneOf(TITLE_RECIPE_WRAPPERS, segment.wrapper)) {
    out.wrapper = segment.wrapper;
  }
  if (isOneOf(TITLE_RECIPE_CONNECTORS, segment.connector)) {
    out.connector = segment.connector;
  }
  return out;
}

/**
 * Coerce arbitrary stored/JSON input into a valid recipe. Unknown or malformed
 * segments are dropped; a recipe that sanitizes to nothing falls back to the
 * default. Used at every read boundary so a stale/foreign value can never
 * crash rendering or editing.
 */
export function sanitizeTitleRecipe(value: unknown): TitleRecipe {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const rawSegments = (value as { segments?: unknown }).segments;
    if (Array.isArray(rawSegments)) {
      const segments = rawSegments
        .map(sanitizeSegment)
        .filter((segment): segment is TitleRecipeSegment => segment !== null)
        .slice(0, TITLE_RECIPE_MAX_SEGMENTS);
      if (segments.length > 0) {
        return { segments };
      }
    }
  }
  return DEFAULT_TITLE_RECIPE;
}

// ---------------------------------------------------------------------------
// Pure renderer
// ---------------------------------------------------------------------------

function peopleText(style: TitlePeopleStyle, people: EventTitlePerson[]): string {
  const byStyle = (s: TitlePeopleStyle): string[] =>
    people.map((person) => person[s]?.trim()).filter(Boolean) as string[];
  const names = byStyle(style);
  return names.length > 0 ? names.join(", ") : "";
}

function typeText(style: TitleTypeStyle, eventType: EventTitleType | null): string {
  if (eventType === null) {
    return "";
  }
  if (style === "name") {
    return eventType.name.trim();
  }
  return (eventType.acronym || eventType.name).trim();
}

/** The wall-clock text for a `time` segment (mirrors the audit clock). */
function timeText(input: EventTitleRecipeInput): string {
  if (input.timeFull) {
    return input.timeFull.trim();
  }
  if (input.timeOption === "range" && input.startTime && input.endTime) {
    return `${input.startTime}-${input.endTime}`;
  }
  if (input.timeOption === "half") {
    return input.startAmPm || "";
  }
  return "";
}

function segmentText(segment: TitleRecipeSegment, input: EventTitleRecipeInput): string {
  switch (segment.field) {
    case "description":
      return input.description.trim();
    case "type":
      return typeText(segment.typeStyle ?? "name", input.eventType);
    case "people":
      return peopleText(segment.peopleStyle ?? "fqn", input.people);
    case "departments":
      return input.departments.map((name) => name.trim()).filter(Boolean).join(", ");
    case "location":
      return input.location.trim();
    case "time":
      return timeText(input);
    case "text":
      return (segment.text ?? "").trim();
  }
}

/**
 * Render an event title from a recipe. Each segment renders only when its
 * field resolves to non-empty content; the segment's own wrapper (if any)
 * surrounds it. A segment's **connector joins it to the next rendered
 * segment** (never used after the final rendered segment, so nothing can lead
 * or trail). Returns "" when nothing renders (callers fall back, e.g. to the
 * raw description).
 */
export function renderTitleRecipe(input: EventTitleRecipeInput, recipe: TitleRecipe): string {
  const rendered: { text: string; connector: TitleRecipeConnector }[] = [];
  for (const segment of recipe.segments) {
    const inner = segmentText(segment, input);
    if (!inner) {
      continue;
    }
    const [open, close] = WRAPPER_TEXT[segment.wrapper ?? "none"];
    rendered.push({ text: `${open}${inner}${close}`, connector: segment.connector ?? "none" });
  }
  let out = "";
  for (let i = 0; i < rendered.length; i += 1) {
    out += rendered[i].text;
    // Connectors separate this rendered segment from the NEXT one; the final
    // rendered segment never carries a trailing connector.
    if (i < rendered.length - 1) {
      out += TITLE_CONNECTOR_TEXT[rendered[i].connector];
    }
  }
  return out.trim();
}

// ---------------------------------------------------------------------------
// Validation (for the settings form + server action)
// ---------------------------------------------------------------------------

export interface TitleRecipeFormErrors {
  recipe?: string;
}

/**
 * Validate a recipe for storage/editing. Duplicate fields are allowed (an
 * admin may want type twice); the constraints are: at least one segment and a
 * bounded segment count. Decoration/style values are already constrained by
 * the sanitizer + UI, but a malformed payload is rejected here, not silently
 * defaulted.
 */
export function validateTitleRecipe(recipe: TitleRecipe): TitleRecipeFormErrors {
  if (!recipe || !Array.isArray(recipe.segments) || recipe.segments.length === 0) {
    return { recipe: "Add at least one field" };
  }
  if (recipe.segments.length > TITLE_RECIPE_MAX_SEGMENTS) {
    return { recipe: `At most ${TITLE_RECIPE_MAX_SEGMENTS} fields allowed` };
  }
  const invalid = recipe.segments.some(
    (segment) =>
      !isField(segment.field) ||
      (segment.typeStyle !== undefined && !isOneOf(TITLE_TYPE_STYLES, segment.typeStyle)) ||
      (segment.peopleStyle !== undefined && !isOneOf(TITLE_PEOPLE_STYLES, segment.peopleStyle)) ||
      (segment.wrapper !== undefined && !isOneOf(TITLE_RECIPE_WRAPPERS, segment.wrapper)) ||
      (segment.connector !== undefined && !isOneOf(TITLE_RECIPE_CONNECTORS, segment.connector)),
  );
  return invalid ? { recipe: "Recipe contains an unknown value" } : {};
}
