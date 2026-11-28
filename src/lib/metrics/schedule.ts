/**
 * Pure scheduling helpers for the daily resource-usage snapshot.
 *
 * The snapshot is taken by an in-app lazy trigger — the first authenticated
 * activity at/after the configured cutoff — because this deployment has no
 * external scheduler (the same reasoning as the parade-state email, see
 * `docs/parade-state-email.md` §1.4). Everything here is free of I/O and
 * unit-tested, so the lazy tick can bail out before it touches the database.
 *
 * The lazy pass closes **completed days only** (yesterday and earlier): the
 * cutoff is the earliest time of day the close may run, and the day it closes
 * is the one that has already ended. This is deliberate — an office-hours app
 * is never open at an end-of-day cutoff like 23:55, so a same-day close would
 * never run at all, which is exactly how the ledger shipped "No data" forever.
 * The admin's "Snapshot now" button is the exception: it force-closes through
 * today, partial data and all, because that is what pressing a button means.
 *
 * The schedule is defined on the UTC+8 wall clock, matching every other
 * time-of-day setting in the app.
 */

import { formatInstantToNaive } from "@/lib/events/datetime";

import { METRICS_DEFAULT_SNAPSHOT_TIME } from "./config";

/** A UTC+8 wall-clock reading: calendar date, ISO weekday (1=Mon…7=Sun), minutes since midnight. */
export interface MetricsClock {
  date: string;
  weekday: number;
  minutes: number;
}

/** Read an instant as the UTC+8 wall clock the schedule is defined in. */
export function metricsNow(now: Date): MetricsClock {
  const naive = formatInstantToNaive(now);
  const date = naive.slice(0, 10);
  const [hours, minutes] = naive.slice(11, 16).split(":").map(Number);
  // JS `getUTCDay`: 0=Sun..6=Sat; convert to ISO 1=Mon..7=Sun.
  const jsDay = new Date(`${date}T00:00:00Z`).getUTCDay();
  return { date, weekday: jsDay === 0 ? 7 : jsDay, minutes: hours * 60 + minutes };
}

/** Parse a `HH:mm` cutoff to minutes since midnight; malformed input falls back to the default. */
export function parseSnapshotTime(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return timeToMinutes(METRICS_DEFAULT_SNAPSHOT_TIME);
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return timeToMinutes(METRICS_DEFAULT_SNAPSHOT_TIME);
  }
  return hours * 60 + minutes;
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export interface MetricsSnapshotWindowInput {
  enabled: boolean;
  now: Date;
  /** Admin-configured UTC+8 cutoff, `HH:mm`. */
  snapshotTime: string;
  /** ISO weekdays (1=Mon … 7=Sun) a snapshot is taken on. */
  days: number[];
}

export type MetricsSnapshotWindowReason = "disabled" | "not-a-snapshot-day" | "before-time";

export type MetricsSnapshotWindowResult =
  | { open: true }
  | { open: false; reason: MetricsSnapshotWindowReason };

/**
 * Whether the snapshot window is open at `now`: enabled, today (UTC+8) is a
 * listed snapshot day, and the clock is at/after the cutoff.
 */
export function metricsSnapshotWindowOpen(
  input: MetricsSnapshotWindowInput,
): MetricsSnapshotWindowResult {
  if (!input.enabled) {
    return { open: false, reason: "disabled" };
  }
  const { weekday, minutes } = metricsNow(input.now);
  if (!input.days.includes(weekday)) {
    return { open: false, reason: "not-a-snapshot-day" };
  }
  if (minutes < parseSnapshotTime(input.snapshotTime)) {
    return { open: false, reason: "before-time" };
  }
  return { open: true };
}

/** The ledger date (`YYYY-MM-DD`, UTC+8) for an instant. */
export function metricsSnapshotDate(now: Date): string {
  return metricsNow(now).date;
}

/** Shift a `YYYY-MM-DD` date by whole days, staying on the UTC+8 calendar. */
export function shiftDate(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** Whole-day distance from `from` to `to` (both `YYYY-MM-DD`); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) {
    return 0;
  }
  return Math.round((b - a) / 86_400_000);
}

export interface PendingSnapshotDaysInput {
  /** Latest day already closed into `metrics_day`; null when the ledger is empty. */
  lastClosedDay: string | null;
  /** Today (UTC+8). */
  today: string;
  /**
   * Latest day this pass may close (inclusive). The lazy pass passes
   * yesterday — only completed days get closed automatically — while the
   * forced button closes through today. Defaults to `today`.
   */
  latestDay?: string;
  /** Never back-fill more than this many days in one run. */
  maxBackfill?: number;
}

/**
 * Which days this run should close, oldest first.
 *
 * A day nobody was online for after the cutoff is **delayed, never skipped**:
 * every counter the collector reads is date-keyed, so a late run still closes
 * the right day. Without this, a quiet weekend would silently punch holes in
 * the month-to-date totals the budget bars are built from.
 */
export function pendingSnapshotDays(input: PendingSnapshotDaysInput): string[] {
  const maxBackfill = input.maxBackfill ?? 7;
  const latest = input.latestDay ?? input.today;
  if (!input.lastClosedDay) {
    return [latest];
  }
  const gap = daysBetween(input.lastClosedDay, latest);
  if (gap <= 0) {
    // Everything through `latest` is already closed (or the clock moved
    // backwards) — nothing due.
    return [];
  }
  const count = Math.min(gap, maxBackfill);
  return Array.from({ length: count }, (_, index) => shiftDate(latest, index - count + 1));
}
