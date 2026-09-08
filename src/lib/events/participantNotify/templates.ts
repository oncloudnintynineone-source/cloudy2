/**
 * DEPRECATED free-text notification content templates. Push copy is now
 * template-driven (Settings → Templates → recipes assigned to the
 * `notifyCreated`/`notifyAdded` targets; see `src/lib/events/notifyRecipes.ts`).
 * These constants remain only because the Drizzle schema column defaults
 * reference them — the columns are never read at runtime.
 */

/** The two template fields per reason an admin edits in Settings → Templates. */
export interface ParticipantNotifyTemplates {
  /** Title shown when a new event is created. */
  createdTitle: string;
  /** Body shown when a new event is created. */
  createdBody: string;
  /** Title shown when the user is added to an existing event. */
  addedTitle: string;
  /** Body shown when the user is added to an existing event. */
  addedBody: string;
}

/** The built-in wording; blank stored fields fall back to these. */
export const PARTICIPANT_NOTIFY_TEMPLATES_DEFAULT: ParticipantNotifyTemplates = {
  createdTitle: "{title}",
  createdBody: "You're included in a new event< · {time}>< · {location}>",
  addedTitle: "{title}",
  addedBody: "You've been added to this event< · {time}>< · {location}>",
};

/** Tokens a participant-notification template may use, for UI descriptions. */
export const PARTICIPANT_NOTIFY_TEMPLATE_PLACEHOLDERS = [
  "{title}",
  "{type}",
  "{time}",
  "{location}",
] as const;

/** One field's value, trimmed, or the built-in default when blank. */
function field(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

/**
 * Resolve a (possibly partial / blank) stored template set to a complete set:
 * any blank/absent field falls back to the built-in default, so a cleared
 * settings field never produces an empty notification. Used by the settings
 * read path and the dispatch read.
 */
export function resolveParticipantNotifyTemplates(
  raw: Partial<ParticipantNotifyTemplates> | null | undefined,
): ParticipantNotifyTemplates {
  const defaults = PARTICIPANT_NOTIFY_TEMPLATES_DEFAULT;
  return {
    createdTitle: field(raw?.createdTitle, defaults.createdTitle),
    createdBody: field(raw?.createdBody, defaults.createdBody),
    addedTitle: field(raw?.addedTitle, defaults.addedTitle),
    addedBody: field(raw?.addedBody, defaults.addedBody),
  };
}
