/**
 * Pure validation/normalization helpers for the KAH screens. Kept free of
 * I/O so they can be unit-tested without a database.
 */

export const KAH_GROUP_NAME_MAX_LENGTH = 80;
export const KAH_PERCENTAGE_MIN = 1;
export const KAH_PERCENTAGE_MAX = 100;

export interface KahGroupFormValues {
  name: string;
  minPercentage: number;
}

export interface KahGroupFormErrors {
  name?: string;
  minPercentage?: string;
  [key: string]: string | undefined;
}

/** Trim a group name, or null when empty/too long. */
export function normalizeKahGroupName(raw: string): string | null {
  const name = raw.trim();
  if (!name || name.length > KAH_GROUP_NAME_MAX_LENGTH) {
    return null;
  }
  return name;
}

/**
 * Coerce a percentage to a whole number clamped to
 * `KAH_PERCENTAGE_MIN`..`KAH_PERCENTAGE_MAX`; non-finite input falls back to
 * the max (the schema default).
 */
export function normalizeKahPercentage(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return KAH_PERCENTAGE_MAX;
  }
  const pct = Math.round(numeric);
  if (pct < KAH_PERCENTAGE_MIN) {
    return KAH_PERCENTAGE_MIN;
  }
  if (pct > KAH_PERCENTAGE_MAX) {
    return KAH_PERCENTAGE_MAX;
  }
  return pct;
}

export function validateKahGroupForm(values: KahGroupFormValues): KahGroupFormErrors {
  const errors: KahGroupFormErrors = {};

  if (!values.name.trim()) {
    errors.name = "Name is required";
  } else if (values.name.trim().length > KAH_GROUP_NAME_MAX_LENGTH) {
    errors.name = `Name must be ${KAH_GROUP_NAME_MAX_LENGTH} characters or fewer`;
  }

  if (!Number.isFinite(values.minPercentage)) {
    errors.minPercentage = "Percentage must be a number";
  } else if (values.minPercentage < KAH_PERCENTAGE_MIN) {
    errors.minPercentage = `Percentage must be at least ${KAH_PERCENTAGE_MIN}%`;
  } else if (values.minPercentage > KAH_PERCENTAGE_MAX) {
    errors.minPercentage = `Percentage must be at most ${KAH_PERCENTAGE_MAX}%`;
  }

  return errors;
}

/** The members-picker error key used by the group form for an empty selection. */
export const KAH_MEMBERS_EMPTY_ERROR = "Select at least one member";

export const KAH_EMAIL_SUBJECT_MAX_LENGTH = 200;
export const KAH_EMAIL_BODY_MAX_LENGTH = 5000;
/** The one load-bearing token: without it the email carries no breach data. */
export const KAH_EMAIL_BODY_REQUIRED_TOKEN = "{breaches}";

/** Tokens a KAH email template may use, for UI descriptions. */
export const KAH_EMAIL_TEMPLATE_PLACEHOLDERS = [
  "{event}",
  "{actor}",
  "{window}",
  "{breaches}",
] as const;

export interface KahNotificationsFormValues {
  subjectTemplate: string;
  bodyTemplate: string;
}

export interface KahNotificationsFormErrors {
  subjectTemplate?: string;
  bodyTemplate?: string;
  [key: string]: string | undefined;
}

/**
 * Validate the KAH email templates: subject and body. The body must carry
 * `{breaches}` — every other omission degrades gracefully (blank tokens
 * render as empty), but dropping the breach block would make the email
 * pointless.
 */
export function validateKahNotificationsForm(
  values: KahNotificationsFormValues,
): KahNotificationsFormErrors {
  const errors: KahNotificationsFormErrors = {};

  const subject = values.subjectTemplate.trim();
  if (!subject) {
    errors.subjectTemplate = "Subject template is required";
  } else if (subject.length > KAH_EMAIL_SUBJECT_MAX_LENGTH) {
    errors.subjectTemplate = `Subject must be ${KAH_EMAIL_SUBJECT_MAX_LENGTH} characters or fewer`;
  }

  const body = values.bodyTemplate.trim();
  if (!body) {
    errors.bodyTemplate = "Body template is required";
  } else if (body.length > KAH_EMAIL_BODY_MAX_LENGTH) {
    errors.bodyTemplate = `Body must be ${KAH_EMAIL_BODY_MAX_LENGTH} characters or fewer`;
  } else if (!body.toLowerCase().includes(KAH_EMAIL_BODY_REQUIRED_TOKEN)) {
    errors.bodyTemplate =
      "Body must contain {breaches} — it renders the per-group breach summary";
  }

  return errors;
}
