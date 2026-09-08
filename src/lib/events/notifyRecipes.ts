/**
 * Built-in notification copy when a notification target has no template
 * assigned. Pushes reuse the same structured recipes as event titles: the push
 * title is the event's rendered title; the body is the target's recipe —
 * normally a leading `text` segment (the intro sentence) followed by fields.
 * Notification targets fall back to these defaults (NOT the master title
 * template), so an unconfigured site still pushes readable copy.
 */

import type { EventTitleAssignmentTarget } from "@/lib/settings/validate";
import type { TitleRecipe } from "@/lib/settings/titleRecipe";

export type NotificationTarget = Extract<
  EventTitleAssignmentTarget,
  "notifyCreated" | "notifyAdded"
>;

const WALL_CLOCK_TIME = { field: "time" as const, wrapper: "paren" as const };

/** Intro sentence for a brand-new event. */
export const NOTIFY_PHRASE_CREATED = "You're included in a new event";
/** Intro sentence for being added to an existing event. */
export const NOTIFY_PHRASE_ADDED = "You've been added to this event";

/** Default body recipe when a new event is created. */
export const NOTIFY_CREATED_DEFAULT: TitleRecipe = {
  segments: [
    { field: "text", text: NOTIFY_PHRASE_CREATED, connector: "middot" },
    { field: "description", connector: "middot" },
    { field: "location", connector: "middot" },
    WALL_CLOCK_TIME,
  ],
};

/** Default body recipe when the user is added to an existing event. */
export const NOTIFY_ADDED_DEFAULT: TitleRecipe = {
  segments: [
    { field: "text", text: NOTIFY_PHRASE_ADDED, connector: "middot" },
    { field: "description", connector: "middot" },
    { field: "location", connector: "middot" },
    WALL_CLOCK_TIME,
  ],
};

export function defaultNotificationRecipe(reason: "created" | "added"): TitleRecipe {
  return reason === "created" ? NOTIFY_CREATED_DEFAULT : NOTIFY_ADDED_DEFAULT;
}

export function notificationTarget(reason: "created" | "added"): NotificationTarget {
  return reason === "created" ? "notifyCreated" : "notifyAdded";
}

/**
 * The recipe a notification target uses: the assigned library template when
 * one is set, else the built-in default (never the master title recipe).
 */
export function resolveNotificationRecipe(
  reason: "created" | "added",
  assignedTemplateId: string | null | undefined,
  recipesById: ReadonlyMap<string, TitleRecipe>,
): TitleRecipe {
  if (assignedTemplateId) {
    const assigned = recipesById.get(assignedTemplateId);
    if (assigned) {
      return assigned;
    }
  }
  return defaultNotificationRecipe(reason);
}
