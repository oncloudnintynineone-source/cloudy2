/**
 * Pure builder for the KAH breach notification email. One combined message
 * per mutation listing every group that fell below its threshold — flat,
 * human-readable, times in the app's UTC+8 wall clock. The subject and body
 * come from admin-editable templates (settings row; defaults in
 * `emailDefaults.ts`) with `{event}`, `{actor}`, `{window}` and `{breaches}`
 * tokens, substituted with the same case-insensitive, unknown-tokens-stay-
 * literal conventions as `formatEventTitle`. Kept free of I/O so it can be
 * unit-tested without a database.
 */

import { formatInstantToNaive } from "@/lib/events/datetime";
import {
  KAH_EMAIL_BODY_TEMPLATE_DEFAULT,
  KAH_EMAIL_SUBJECT_TEMPLATE_DEFAULT,
} from "./emailDefaults";

/** One breached group as the email renders it (names already resolved). */
export interface KahBreachEmailGroup {
  groupName: string;
  requiredPct: number;
  actualPct: number;
  totalMembers: number;
  awayNames: string[];
}

export interface KahBreachEmailInput {
  breaches: KahBreachEmailGroup[];
  /** The rendered Google Calendar title of the event that caused the check. */
  eventTitle: string;
  /** Display name of the user who saved the event, or null. */
  actorName: string | null;
  windowStart: Date;
  windowEnd: Date;
  /** Admin templates (settings row); omitted/blank = built-in defaults. */
  subjectTemplate?: string | null;
  bodyTemplate?: string | null;
}

export interface KahBreachEmail {
  subject: string;
  body: string;
}

/** The token values a template can use, fully pre-rendered. */
export interface KahTemplateContext {
  event: string;
  actor: string;
  window: string;
  breaches: string;
}

/** Substitute `{token}` placeholders; unknown tokens stay literal text. */
export function renderKahEmailTemplate(template: string, context: KahTemplateContext): string {
  return template.replace(/\{([^{}]+)\}/g, (match, rawToken: string) => {
    const token = rawToken.trim().toLowerCase();
    if (token in context) {
      return context[token as keyof KahTemplateContext];
    }
    return match;
  });
}

/** One breach line of the `{breaches}` block. */
function breachLine(breach: KahBreachEmailGroup): string {
  const away =
    breach.awayNames.length > 0 ? breach.awayNames.join(", ") : "(names unavailable)";
  return (
    `- ${breach.groupName}: ${breach.actualPct}% in country ` +
    `(${breach.totalMembers - breach.awayNames.length} of ${breach.totalMembers} members, ` +
    `required ${breach.requiredPct}%) — away: ${away}`
  );
}

/** Sample context for the Settings live preview (deterministic). */
export const KAH_TEMPLATE_SAMPLE_CONTEXT: KahTemplateContext = {
  event: "Overseas course",
  actor: "Siti Nurul",
  window: "2026-08-21 00:00:00 – 2026-08-23 18:30:00 (UTC+8)",
  breaches: [
    "- Command: 40% in country (3 of 5 members, required 60%) — away: Tan Wei Liang, Lim Kah",
    "- Ops: 50% in country (1 of 2 members, required 100%) — away: Ahmad Zaki",
  ].join("\n"),
};

/**
 * The combined breach email from the admin's templates, or null when there is
 * nothing to report (no breaches → no email; callers skip the send entirely).
 * Blank/absent templates fall back to the built-in defaults so a cleared
 * settings field never produces an empty email.
 */
export function buildKahBreachEmail(input: KahBreachEmailInput): KahBreachEmail | null {
  if (input.breaches.length === 0) {
    return null;
  }

  const context: KahTemplateContext = {
    event: input.eventTitle.trim() || "Untitled event",
    actor: input.actorName?.trim() || "a user",
    window: `${formatInstantToNaive(input.windowStart)} – ${formatInstantToNaive(input.windowEnd)} (UTC+8)`,
    breaches: input.breaches.map(breachLine).join("\n"),
  };
  const subjectTemplate = input.subjectTemplate?.trim() || KAH_EMAIL_SUBJECT_TEMPLATE_DEFAULT;
  const bodyTemplate = input.bodyTemplate?.trim() || KAH_EMAIL_BODY_TEMPLATE_DEFAULT;

  return {
    subject: renderKahEmailTemplate(subjectTemplate, context),
    body: renderKahEmailTemplate(bodyTemplate, context),
  };
}
