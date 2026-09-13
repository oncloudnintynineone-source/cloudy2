/**
 * Pure scheduling helper for the daily parade-state email. All wall-clock times
 * are the app's fixed UTC+8 clock (via `formatInstantToNaive`), so the decision
 * is deterministic and unit-testable without a timezone database.
 */

import { formatInstantToNaive } from "@/lib/events/datetime";

export const DEFAULT_PARADE_EMAIL_SEND_TIME = "07:00";

/** `HH:MM` on a 24-hour clock. */
const SEND_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Coerce a stored send time to a valid `HH:MM`, falling back to the default. */
export function normalizeSendTime(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  return SEND_TIME_PATTERN.test(trimmed) ? trimmed : DEFAULT_PARADE_EMAIL_SEND_TIME;
}

export interface ParadeEmailDueInput {
  enabled: boolean;
  recipientCount: number;
  sendTime: string;
  now: Date;
  alreadySentToday: boolean;
}

export type ParadeEmailDueReason =
  | "disabled"
  | "no-recipients"
  | "already-sent"
  | "before-time";

export interface ParadeEmailDueResult {
  due: boolean;
  reason?: ParadeEmailDueReason;
  /** The snapshot's UTC+8 date (`YYYY-MM-DD`). */
  date: string;
  /** The current UTC+8 wall clock (`HH:MM`). */
  time: string;
}

/**
 * Whether the daily email should send now. Disabled or recipient-less configs
 * never send; a day that already sent is skipped (idempotency); otherwise the
 * send is due once the current UTC+8 time is at/after the configured time.
 */
export function paradeEmailDue(input: ParadeEmailDueInput): ParadeEmailDueResult {
  const naive = formatInstantToNaive(input.now);
  const date = naive.slice(0, 10);
  const time = naive.slice(11, 16);
  const sendTime = normalizeSendTime(input.sendTime);

  if (!input.enabled) {
    return { due: false, reason: "disabled", date, time };
  }
  if (input.recipientCount === 0) {
    return { due: false, reason: "no-recipients", date, time };
  }
  if (input.alreadySentToday) {
    return { due: false, reason: "already-sent", date, time };
  }
  if (time < sendTime) {
    return { due: false, reason: "before-time", date, time };
  }
  return { due: true, date, time };
}

/** The snapshot's UTC+8 date (`YYYY-MM-DD`) for an instant. */
export function paradeEmailDate(now: Date): string {
  return formatInstantToNaive(now).slice(0, 10);
}
