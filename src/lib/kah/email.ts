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

import { formatInstantToNaive, subOneDay } from "@/lib/events/datetime";
import { renderTemplate } from "@/lib/email/template";
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
  /**
   * True when the event occupies whole/half days. The stored window then uses
   * the all-day convention (UTC-midnight start, exclusive next-day end), so the
   * display end is made inclusive (the last civil day) rather than printed as
   * the next day's 08:00 SGT.
   */
  allDay?: boolean;
  /** Admin templates (settings row); omitted/blank = built-in defaults. */
  subjectTemplate?: string | null;
  bodyTemplate?: string | null;
}

export interface KahBreachEmail {
  subject: string;
  body: string;
}

/** The token values a template can use, fully pre-rendered. */
export type KahTemplateContext = {
  event: string;
  actor: string;
  window: string;
  breaches: string;
};

/** Substitute `{token}` placeholders; unknown tokens stay literal text. */
export function renderKahEmailTemplate(template: string, context: KahTemplateContext): string {
  return renderTemplate(template, context);
}

/**
 * The `{window}` display string, UTC+8 wall clock. For all-day events the
 * stored end is Google's exclusive next-day date, so it is converted back to
 * the last civil day (matching `conflictWindowNaive` in `clashActions.ts`) —
 * a one-day event reads as one day, never spilling into the next. Pure.
 */
export function formatKahWindow(windowStart: Date, windowEnd: Date, allDay: boolean): string {
  if (allDay) {
    const startDate = formatInstantToNaive(windowStart).slice(0, 10);
    const endDate = subOneDay(formatInstantToNaive(windowEnd).slice(0, 10));
    return `${startDate} 00:00:00 – ${endDate} 23:59:59 (UTC+8)`;
  }
  return `${formatInstantToNaive(windowStart)} – ${formatInstantToNaive(windowEnd)} (UTC+8)`;
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
    window: formatKahWindow(input.windowStart, input.windowEnd, input.allDay ?? false),
    breaches: input.breaches.map(breachLine).join("\n"),
  };
  const subjectTemplate = input.subjectTemplate?.trim() || KAH_EMAIL_SUBJECT_TEMPLATE_DEFAULT;
  const bodyTemplate = input.bodyTemplate?.trim() || KAH_EMAIL_BODY_TEMPLATE_DEFAULT;

  return {
    subject: renderKahEmailTemplate(subjectTemplate, context),
    body: renderKahEmailTemplate(bodyTemplate, context),
  };
}
