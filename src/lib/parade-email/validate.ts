/**
 * Pure validation for the daily parade-state email settings. Kept free of I/O
 * so it can be unit-tested without a database.
 */

export const PARADE_EMAIL_SUBJECT_MAX_LENGTH = 200;
export const PARADE_EMAIL_BODY_MAX_LENGTH = 10000;

/** The one load-bearing token: without it the email carries no roster. */
export const PARADE_EMAIL_BODY_REQUIRED_TOKEN = "{departments}";

/** Tokens a parade-state email template may use, for UI descriptions. */
export const PARADE_EMAIL_TEMPLATE_PLACEHOLDERS = [
  "{date}",
  "{weekday}",
  "{present}",
  "{total}",
  "{outOfCamp}",
  "{generatedAt}",
  "{departments}",
] as const;

export interface ParadeEmailFormValues {
  enabled: boolean;
  recipientIds: string[];
  subjectTemplate: string;
  bodyTemplate: string;
}

export interface ParadeEmailFormErrors {
  recipientIds?: string;
  subjectTemplate?: string;
  bodyTemplate?: string;
  [key: string]: string | undefined;
}

/**
 * Validate the parade-state email config. Recipients are required only while
 * the feature is enabled (an admin may stage a config before switching it on).
 * The body must carry `{departments}` — every other omission degrades
 * gracefully, but dropping the roster block would make the email pointless.
 */
export function validateParadeEmailForm(values: ParadeEmailFormValues): ParadeEmailFormErrors {
  const errors: ParadeEmailFormErrors = {};

  if (values.enabled && values.recipientIds.length === 0) {
    errors.recipientIds = "Select at least one recipient";
  }

  const subject = values.subjectTemplate.trim();
  if (!subject) {
    errors.subjectTemplate = "Subject template is required";
  } else if (subject.length > PARADE_EMAIL_SUBJECT_MAX_LENGTH) {
    errors.subjectTemplate = `Subject must be ${PARADE_EMAIL_SUBJECT_MAX_LENGTH} characters or fewer`;
  }

  const body = values.bodyTemplate.trim();
  if (!body) {
    errors.bodyTemplate = "Body template is required";
  } else if (body.length > PARADE_EMAIL_BODY_MAX_LENGTH) {
    errors.bodyTemplate = `Body must be ${PARADE_EMAIL_BODY_MAX_LENGTH} characters or fewer`;
  } else if (!body.toLowerCase().includes(PARADE_EMAIL_BODY_REQUIRED_TOKEN)) {
    errors.bodyTemplate =
      "Body must contain {departments} — it renders the per-department roster";
  }

  return errors;
}
