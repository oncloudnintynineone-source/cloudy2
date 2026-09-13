/**
 * Pure scheduling helper for the daily parade-state email. The schedule itself
 * is fixed (weekdays at 08:00 Singapore time) and lives in the Cloud Scheduler
 * job; this module only decides whether the app should act on a tick and
 * resolves the snapshot's UTC+8 calendar date. Kept free of I/O.
 */

import { formatInstantToNaive } from "@/lib/events/datetime";

export interface ParadeEmailDueInput {
  enabled: boolean;
  recipientCount: number;
  alreadySentToday: boolean;
}

export type ParadeEmailDueReason = "disabled" | "no-recipients" | "already-sent";

export interface ParadeEmailDueResult {
  due: boolean;
  reason?: ParadeEmailDueReason;
}

/**
 * Whether the tick should send. The scheduler fires once per weekday at the
 * configured time, so there is no time comparison here; disabled and
 * recipient-less configs never send, and a day that already sent is skipped
 * (idempotency via the unique `send_date`).
 */
export function paradeEmailDue(input: ParadeEmailDueInput): ParadeEmailDueResult {
  if (!input.enabled) {
    return { due: false, reason: "disabled" };
  }
  if (input.recipientCount === 0) {
    return { due: false, reason: "no-recipients" };
  }
  if (input.alreadySentToday) {
    return { due: false, reason: "already-sent" };
  }
  return { due: true };
}

/** The snapshot's UTC+8 date (`YYYY-MM-DD`) for an instant. */
export function paradeEmailDate(now: Date): string {
  return formatInstantToNaive(now).slice(0, 10);
}
