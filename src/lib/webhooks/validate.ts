/**
 * Pure validation/normalization helpers for webhook endpoints. Kept free of
 * I/O so they are unit-testable without a database.
 */

import { normalizeHttpUrl, validateHttpUrl } from "@/lib/validation/url";
import { trimToMax, validateRequiredText } from "@/lib/validation/text";

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
  return trimToMax(raw, WEBHOOK_NAME_MAX_LENGTH);
}

/**
 * Normalize an endpoint URL: trimmed; an empty string means "not set".
 * Returns null when the value is not a valid http(s) URL.
 */
export function normalizeWebhookUrl(raw: string): string | null {
  return normalizeHttpUrl(raw, WEBHOOK_URL_MAX_LENGTH);
}

/** Trim a signing secret; null when over the length cap. */
export function normalizeWebhookSecret(raw: string): string | null {
  const value = raw.trim();
  return value.length > WEBHOOK_SECRET_MAX_LENGTH ? null : value;
}

export function validateWebhookForm(values: WebhookFormValues): WebhookFormErrors {
  const errors: WebhookFormErrors = {};

  const nameError = validateRequiredText(values.name, WEBHOOK_NAME_MAX_LENGTH, {
    requiredMessage: "Name is required",
    maxMessage: `Name must be ${WEBHOOK_NAME_MAX_LENGTH} characters or fewer`,
  });
  if (nameError) {
    errors.name = nameError;
  }

  const url = values.url.trim();
  if (!url) {
    errors.url = "URL is required";
  } else {
    const urlError = validateHttpUrl(url, WEBHOOK_URL_MAX_LENGTH, {
      tooLongMessage: `URL must be ${WEBHOOK_URL_MAX_LENGTH} characters or fewer`,
      invalidMessage: "Enter a valid URL",
      protocolMessage: "URL must start with http:// or https://",
    });
    if (urlError) {
      errors.url = urlError;
    }
  }

  if (values.secret.trim().length > WEBHOOK_SECRET_MAX_LENGTH) {
    errors.secret = `Secret must be ${WEBHOOK_SECRET_MAX_LENGTH} characters or fewer`;
  }

  return errors;
}
