/**
 * The default daily parade-state email templates. Kept in a dependency-free
 * module so both the Drizzle schema (column defaults) and the app code share
 * one source of truth — these must never drift apart, or a fresh DB row would
 * disagree with the fallback used when the row is missing.
 *
 * Tokens: {date} {weekday} {present} {total} {outOfCamp} {generatedAt} and the
 * load-bearing {departments} block (the rendered per-department roster).
 */

export const PARADE_EMAIL_SUBJECT_TEMPLATE_DEFAULT = "[cloudy2] Parade State — {date}";

export const PARADE_EMAIL_BODY_TEMPLATE_DEFAULT = [
  "Parade State for {date} ({weekday})",
  "",
  "Total: {present} present / {total} ({outOfCamp} out of camp)",
  "",
  "{departments}",
].join("\n");
