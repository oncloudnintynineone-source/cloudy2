/**
 * Pure validation/normalization helpers for the KAH screens. Kept free of
 * I/O so they can be unit-tested without a database.
 */

export const KAH_GROUP_NAME_MAX_LENGTH = 80;
export const KAH_PERCENTAGE_MIN = 1;
export const KAH_PERCENTAGE_MAX = 100;
/** Cap on the settings notification email list (kept small on purpose). */
export const KAH_NOTIFICATION_EMAILS_MAX = 10;
export const KAH_EMAIL_MAX_LENGTH = 254;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

/**
 * Trim, drop empties and duplicates (case-insensitive), and cap the list of
 * notification email addresses. Invalid addresses are kept — validation is
 * the form's job; this only normalizes stored values.
 */
export function normalizeKahNotificationEmails(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") {
      continue;
    }
    const email = entry.trim();
    if (!email) {
      continue;
    }
    const key = email.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(email);
    if (out.length >= KAH_NOTIFICATION_EMAILS_MAX) {
      break;
    }
  }
  return out;
}

export interface KahEmailsFormValues {
  emails: string[];
}

export interface KahEmailsFormErrors {
  emails?: string;
  [key: string]: string | undefined;
}

export function validateKahEmailsForm(values: KahEmailsFormValues): KahEmailsFormErrors {
  const errors: KahEmailsFormErrors = {};
  const emails = values.emails.map((email) => email.trim()).filter(Boolean);

  if (emails.length > KAH_NOTIFICATION_EMAILS_MAX) {
    errors.emails = `At most ${KAH_NOTIFICATION_EMAILS_MAX} addresses are allowed`;
    return errors;
  }
  for (const email of emails) {
    if (email.length > KAH_EMAIL_MAX_LENGTH) {
      errors.emails = `Each address must be ${KAH_EMAIL_MAX_LENGTH} characters or fewer`;
      return errors;
    }
    if (!EMAIL_PATTERN.test(email)) {
      errors.emails = `"${email}" is not a valid email address`;
      return errors;
    }
  }
  return errors;
}
