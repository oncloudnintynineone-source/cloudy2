/**
 * Pure validation/normalization helpers for quick links. Kept free of I/O so
 * they are unit-testable without a database.
 */

import { normalizeEventColor } from "@/lib/events/eventColors";
import { normalizeHttpUrl, validateHttpUrl } from "@/lib/validation/url";
import { trimToMax, validateRequiredText } from "@/lib/validation/text";
import { normalizeQuickLinkIcon } from "./icons";

export const QUICK_LINK_LABEL_MAX_LENGTH = 40;
export const QUICK_LINK_URL_MAX_LENGTH = 2048;

export interface QuickLinkFormValues {
  label: string;
  url: string;
  icon: string;
  color: string;
  enabled: boolean;
}

export interface QuickLinkFormErrors {
  label?: string;
  url?: string;
  [key: string]: string | undefined;
}

/** Trim the link label; null when missing or over the length cap. */
export function normalizeQuickLinkLabel(raw: string): string | null {
  return trimToMax(raw, QUICK_LINK_LABEL_MAX_LENGTH);
}

/**
 * Normalize a link URL: trimmed; an empty string means "not set". Returns
 * null when the value is not a valid http(s) URL (only http/https may be
 * opened, so `javascript:` & co. are rejected).
 */
export function normalizeQuickLinkUrl(raw: string): string | null {
  return normalizeHttpUrl(raw, QUICK_LINK_URL_MAX_LENGTH);
}

/**
 * Normalize a validated form into DB values. Label and URL are required by
 * `validateQuickLinkForm`; the null returns here only guard stale clients.
 */
export function normalizeQuickLinkForm(values: QuickLinkFormValues): {
  ok: boolean;
  values?: { label: string; url: string; icon: string; color: string | null };
  error?: string;
  field?: "label" | "url";
} {
  const label = normalizeQuickLinkLabel(values.label);
  if (label === null) {
    return {
      ok: false,
      error: `Label must be ${QUICK_LINK_LABEL_MAX_LENGTH} characters or fewer`,
      field: "label",
    };
  }
  const url = normalizeQuickLinkUrl(values.url);
  if (url === null) {
    return { ok: false, error: "Enter a valid http(s) URL", field: "url" };
  }
  if (url === "") {
    return { ok: false, error: "URL is required", field: "url" };
  }
  return {
    ok: true,
    values: {
      label,
      url,
      icon: normalizeQuickLinkIcon(values.icon),
      color: normalizeEventColor(values.color),
    },
  };
}

export function validateQuickLinkForm(values: QuickLinkFormValues): QuickLinkFormErrors {
  const errors: QuickLinkFormErrors = {};

  const labelError = validateRequiredText(values.label, QUICK_LINK_LABEL_MAX_LENGTH, {
    requiredMessage: "Label is required",
    maxMessage: `Label must be ${QUICK_LINK_LABEL_MAX_LENGTH} characters or fewer`,
  });
  if (labelError) {
    errors.label = labelError;
  }

  const url = values.url.trim();
  if (!url) {
    errors.url = "URL is required";
  } else {
    const urlError = validateHttpUrl(url, QUICK_LINK_URL_MAX_LENGTH, {
      tooLongMessage: `URL must be ${QUICK_LINK_URL_MAX_LENGTH} characters or fewer`,
      invalidMessage: "Enter a valid URL",
      protocolMessage: "URL must start with http:// or https://",
    });
    if (urlError) {
      errors.url = urlError;
    }
  }

  return errors;
}
