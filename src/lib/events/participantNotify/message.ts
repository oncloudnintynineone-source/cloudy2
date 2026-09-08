/**
 * Pure builder for the participant-invite push notification's human text
 * (title + body). The wording comes from admin-editable content templates
 * (Settings → Templates), rendered through the shared token-template engine
 * with `{title}` / `{type}` / `{time}` / `{location}` tokens; blank/absent
 * stored fields fall back to the built-in defaults in `templates.ts`. Times
 * arrive pre-formatted (`time`) from the dispatch path — the audit log's UTC+8
 * wall-clock string — so a notification reads exactly like the event's audit
 * "time" string. Rendering is kept here I/O-free and unit-tested so the
 * dispatch path only resolves recipients + subscriptions and hands each one a
 * ready-made payload.
 */

import { renderTokenTemplate, type TokenTemplateResolver } from "@/lib/settings/tokenTemplate";
import {
  resolveParticipantNotifyTemplates,
  type ParticipantNotifyTemplates,
} from "./templates";

/** Whether the notification follows a create (whole event is new) or an
 *  update where the user was newly added to an existing event. */
export type ParticipantNotifyReason = "created" | "added";

export interface ParticipantNotification {
  /** The notification headline (event title when one exists). */
  title: string;
  /** The notification body (why + when [+ where]). */
  body: string;
}

/** The token values a participant-notification template can use. */
interface ParticipantTemplateContext {
  /** The rendered Google Calendar event title. */
  title: string;
  /** The event-type name. */
  type: string;
  /** The event's UTC+8 wall-clock window string. */
  time: string;
  /** The event's location. */
  location: string;
}

/** Fallback headline when the rendered title resolves blank and no type exists. */
function fallbackHeadline(reason: ParticipantNotifyReason): string {
  return reason === "created" ? "New event" : "Event update";
}

/** Resolve one of the four notification tokens (styles unsupported). */
function contextValue(token: string, context: ParticipantTemplateContext): string | null {
  if (token === "title") return context.title;
  if (token === "type") return context.type;
  if (token === "time") return context.time;
  if (token === "location") return context.location;
  return null;
}

/**
 * Build the { title, body } shown by the OS from the reason's admin template.
 * `templates` is the resolved, admin-stored set (any blank field already
 * defaulted by `resolveParticipantNotifyTemplates`); when omitted the built-in
 * defaults are used. `title` is the rendered Google Calendar title (types that
 * hide the remarks field can save blank titles) and `eventType` the type name
 * — when the rendered title comes out blank the title falls back to the event
 * type name, then to a generic reason headline, exactly like the pre-template
 * wording. `body` renders the body template; empty tokens drop their
 * `< ... >` groups.
 */
export function buildParticipantNotification(input: {
  reason: ParticipantNotifyReason;
  /** The rendered event title (may be blank/whitespace). */
  title: string;
  /** The event type name, used as a secondary headline fallback. */
  eventType: string;
  /** The event's UTC+8 wall-clock window string (see `formatEventAuditTime`). */
  time: string;
  /** The optional location (in/out-of-camp place). */
  location: string | null;
  /** Admin content templates; omitted = built-in defaults. */
  templates?: ParticipantNotifyTemplates | null;
}): ParticipantNotification {
  const templates = resolveParticipantNotifyTemplates(input.templates);
  const titleTemplate = input.reason === "created" ? templates.createdTitle : templates.addedTitle;
  const bodyTemplate = input.reason === "created" ? templates.createdBody : templates.addedBody;

  const context: ParticipantTemplateContext = {
    title: input.title.trim(),
    type: input.eventType.trim(),
    time: input.time.trim(),
    location: input.location?.trim() ?? "",
  };
  const resolver: TokenTemplateResolver = (token, style) =>
    style === undefined ? contextValue(token, context) : null;

  const renderedTitle = renderTokenTemplate(titleTemplate, resolver).trim();
  const title = renderedTitle || context.type || fallbackHeadline(input.reason);
  const body = renderTokenTemplate(bodyTemplate, resolver).trim();

  return { title, body };
}
