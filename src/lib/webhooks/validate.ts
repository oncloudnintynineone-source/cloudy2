/**
 * Pure validation/normalization helpers for webhook endpoints. Kept free of
 * I/O so they are unit-testable without a database.
 */

export const WEBHOOK_NAME_MAX_LENGTH = 100;
export const WEBHOOK_URL_MAX_LENGTH = 500;
export const WEBHOOK_SECRET_MAX_LENGTH = 200;

export interface WebhookFormValues {
  name: string;
  url: string;
  secret: string;
  enabled: boolean;
}

export interface WebhookFormErrors {
  name?: string;
  url?: string;
  secret?: string;
  [key: string]: string | undefined;
}

/** Trim the endpoint label; null when missing or over the length cap. */
export function normalizeWebhookName(raw: string): string | null {
  const value = raw.trim();
  if (!value || value.length > WEBHOOK_NAME_MAX_LENGTH) {
    return null;
  }
  return value;
}

/**
 * Normalize an endpoint URL: trimmed; an empty string means "not set".
 * Returns null when the value is not a valid http(s) URL.
 */
export function normalizeWebhookUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) {
    return "";
  }
  if (value.length > WEBHOOK_URL_MAX_LENGTH) {
    return null;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
  } catch {
    return null;
  }
  return value;
}

/** Trim a signing secret; null when over the length cap. */
export function normalizeWebhookSecret(raw: string): string | null {
  const value = raw.trim();
  return value.length > WEBHOOK_SECRET_MAX_LENGTH ? null : value;
}

export function validateWebhookForm(values: WebhookFormValues): WebhookFormErrors {
  const errors: WebhookFormErrors = {};

  const name = values.name.trim();
  if (!name) {
    errors.name = "Name is required";
  } else if (name.length > WEBHOOK_NAME_MAX_LENGTH) {
    errors.name = `Name must be ${WEBHOOK_NAME_MAX_LENGTH} characters or fewer`;
  }

  const url = values.url.trim();
  if (!url) {
    errors.url = "URL is required";
  } else if (url.length <= WEBHOOK_URL_MAX_LENGTH) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        errors.url = "URL must start with http:// or https://";
      }
    } catch {
      errors.url = "Enter a valid URL";
    }
  }

  if (values.secret.trim().length > WEBHOOK_SECRET_MAX_LENGTH) {
    errors.secret = `Secret must be ${WEBHOOK_SECRET_MAX_LENGTH} characters or fewer`;
  }

  return errors;
}
