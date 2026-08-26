/**
 * The default KAH breach email templates. Kept in a dependency-free module so
 * both the Drizzle schema (column defaults) and the app code can share one
 * source of truth — these must never drift apart, or a fresh DB row would
 * disagree with the fallback used when the row is missing.
 */

export const KAH_EMAIL_SUBJECT_TEMPLATE_DEFAULT =
  "[cloudy2] KAH limit exceeded — {event}";

export const KAH_EMAIL_BODY_TEMPLATE_DEFAULT = [
  "Key Appointment Holder limit exceeded.",
  "",
  'After "{event}" was saved by {actor}, the following groups are below',
  "their required in-country percentage for the affected period:",
  "",
  "{breaches}",
  "",
  "Event window: {window}",
  "",
  "This is a notification only — the event was saved. Adjust the event or",
  "the KAH groups in Settings if this was not intended.",
].join("\n");
