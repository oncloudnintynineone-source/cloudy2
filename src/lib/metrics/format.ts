/**
 * Display formatting for ledger values.
 *
 * Units are binary (KiB/MiB/GiB) because the caps being measured against are
 * Neon's storage/egress allowances, which are quoted in binary units — a
 * decimal "5.4 GB" against a "5 GB" cap would read as a breach that isn't one.
 *
 * Pure and locale-neutral (the app is single-locale) so the same string comes
 * out of a server component and a client re-render.
 */

import { formatInstantToNaive } from "@/lib/events/datetime";

const BINARY_UNITS = ["B", "KiB", "MiB", "GiB", "TiB"] as const;

/** Bytes → human binary string. Non-finite input renders as an em dash. */
export function formatBytes(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  const negative = value < 0;
  let size = Math.abs(value);
  let unit = 0;
  while (size >= 1024 && unit < BINARY_UNITS.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const digits = unit === 0 ? 0 : size >= 100 ? 0 : size >= 10 ? 1 : 2;
  const text = `${size.toFixed(digits)} ${BINARY_UNITS[unit]}`;
  return negative ? `-${text}` : text;
}

/** Minutes → "3h 42m" (or "42m" under an hour, "0m" at zero). */
export function formatMinutes(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  const total = Math.round(value);
  if (total < 60) {
    return `${total}m`;
  }
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/** Seconds → the most readable of s / m / h. */
export function formatSeconds(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  if (value < 60) {
    return `${Math.round(value)}s`;
  }
  if (value < 3600) {
    return `${Math.round(value / 60)}m`;
  }
  return `${(value / 3600).toFixed(1)}h`;
}

/** A 0–1 ratio as a percentage string. */
export function formatRatio(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return `${(value * 100).toFixed(digits)}%`;
}

/** Counts with thousands separators; large counts compact to 12.4k. */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  const rounded = Math.round(value);
  if (Math.abs(rounded) >= 100_000) {
    return `${(rounded / 1000).toFixed(1)}k`;
  }
  return rounded.toLocaleString("en-US");
}

/** Format a ledger value by its metric unit. */
export function formatByUnit(unit: string, value: number | null | undefined): string {
  switch (unit) {
    case "bytes":
      return formatBytes(value);
    case "minutes":
      return formatMinutes(value);
    case "seconds":
      return formatSeconds(value);
    case "ratio":
      return formatRatio(value);
    case "epoch":
      return formatEpoch(value);
    default:
      return formatCount(value);
  }
}

/** Epoch seconds → `YYYY-MM-DD HH:mm` (UTC+8, the ledger's own clock). */
export function formatEpoch(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
    return "—";
  }
  // Ledger timestamps are read on the UTC+8 wall clock the schedule uses —
  // the same helper the calendar module and the snapshot schedule read from.
  return formatInstantToNaive(new Date(value * 1000)).slice(0, 16);
}

/** "26 Nov" from a `YYYY-MM-DD` ledger date, for ledger table rows. */
export function formatLedgerDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) {
    return day;
  }
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${date} ${months[month - 1] ?? ""}`.trim();
}

/** Human age for "Refreshed … ago" style captions. */
export function formatAge(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "—";
  }
  if (seconds < 60) {
    return "just now";
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ago`;
  }
  if (seconds < 86_400) {
    return `${Math.floor(seconds / 3600)}h ago`;
  }
  return `${Math.floor(seconds / 86_400)}d ago`;
}
