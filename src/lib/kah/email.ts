/**
 * Pure builder for the KAH breach notification email. One combined message
 * per mutation listing every group that fell below its threshold — flat,
 * human-readable, times in the app's UTC+8 wall clock. Kept free of I/O so
 * it can be unit-tested without a database.
 */

import { formatInstantToNaive } from "@/lib/events/datetime";

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
}

export interface KahBreachEmail {
  subject: string;
  body: string;
}

/**
 * The combined breach email, or null when there is nothing to report (no
 * breaches → no email; callers skip the send entirely).
 */
export function buildKahBreachEmail(input: KahBreachEmailInput): KahBreachEmail | null {
  if (input.breaches.length === 0) {
    return null;
  }

  const title = input.eventTitle.trim() || "Untitled event";
  const actor = input.actorName?.trim() || "a user";
  const window = `${formatInstantToNaive(input.windowStart)} – ${formatInstantToNaive(input.windowEnd)} (UTC+8)`;

  const lines = input.breaches.map((breach) => {
    const away =
      breach.awayNames.length > 0 ? breach.awayNames.join(", ") : "(names unavailable)";
    return (
      `- ${breach.groupName}: ${breach.actualPct}% in country ` +
      `(${breach.totalMembers - breach.awayNames.length} of ${breach.totalMembers} members, ` +
      `required ${breach.requiredPct}%) — away: ${away}`
    );
  });

  return {
    subject: `[cloudy2] KAH limit exceeded — ${title}`,
    body: [
      "Key Appointment Holder limit exceeded.",
      "",
      `After "${title}" was saved by ${actor}, the following groups are below`,
      "their required in-country percentage for the affected period:",
      "",
      ...lines,
      "",
      `Event window: ${window}`,
      "",
      "This is a notification only — the event was saved. Adjust the event or",
      "the KAH groups in Settings if this was not intended.",
    ].join("\n"),
  };
}
