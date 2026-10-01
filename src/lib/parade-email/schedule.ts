/**
 * Pure scheduling helpers for the daily parade-state email. The email is sent
 * by an in-app lazy trigger (the first authenticated activity after the
 * configured cutoff), so the app owns *when* it is due — there is no external
 * scheduler. Everything here is free of I/O and unit-tested.
 */

import { formatInstantToNaive } from "@/lib/events/datetime";

export const PARADE_EMAIL_DEFAULT_SEND_TIME = "08:00";
export const PARADE_EMAIL_DEFAULT_DAYS = [1, 2, 3, 4, 5] as const;

/** A UTC+8 wall-clock reading: calendar date, ISO weekday (1=Mon…7=Sun), minutes since midnight. */
export interface ParadeEmailClock {
  date: string;
  weekday: number;
  minutes: number;
}

/** Read an instant as the UTC+8 wall clock the schedule is defined in. */
export function paradeEmailNow(now: Date): ParadeEmailClock {
  const naive = formatInstantToNaive(now);
  const date = naive.slice(0, 10);
  const [hours, minutes] = naive.slice(11, 16).split(":").map(Number);
  // JS `getUTCDay`: 0=Sun..6=Sat; convert to ISO 1=Mon..7=Sun.
  const jsDay = new Date(`${date}T00:00:00Z`).getUTCDay();
  return { date, weekday: jsDay === 0 ? 7 : jsDay, minutes: hours * 60 + minutes };
}

/** Parse a `HH:mm` send time to minutes since midnight; malformed input falls back to 08:00. */
export function parseSendTime(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return 8 * 60;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return 8 * 60;
  }
  return hours * 60 + minutes;
}

export interface ParadeEmailWindowInput {
  enabled: boolean;
  /** Configured recipient id count — checked before any per-tick email resolution. */
  recipientCount: number;
  now: Date;
  /** Admin-configured UTC+8 cutoff, `HH:mm`. */
  sendTime: string;
  /** ISO weekdays the email may go out on. */
  days: number[];
}

export type ParadeEmailWindowReason = "disabled" | "no-recipients" | "not-a-send-day" | "before-time";

export type ParadeEmailWindowResult =
  | { open: true }
  | { open: false; reason: ParadeEmailWindowReason };

/**
 * Whether the configured send window is open at `now`: enabled, has configured
 * recipients, today (UTC+8) is a listed send day, and the current UTC+8 time is
 * at/after the configured cutoff. Pure, so the lazy trigger can bail out before
 * any per-tick database read.
 */
export function paradeEmailWindowOpen(input: ParadeEmailWindowInput): ParadeEmailWindowResult {
  if (!input.enabled) {
    return { open: false, reason: "disabled" };
  }
  if (input.recipientCount === 0) {
    return { open: false, reason: "no-recipients" };
  }
  const { weekday, minutes } = paradeEmailNow(input.now);
  if (!input.days.includes(weekday)) {
    return { open: false, reason: "not-a-send-day" };
  }
  if (minutes < parseSendTime(input.sendTime)) {
    return { open: false, reason: "before-time" };
  }
  return { open: true };
}

/** The snapshot's UTC+8 date (`YYYY-MM-DD`) for an instant. */
export function paradeEmailDate(now: Date): string {
  return paradeEmailNow(now).date;
}
