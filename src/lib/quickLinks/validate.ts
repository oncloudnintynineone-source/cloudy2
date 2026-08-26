/**
 * Pure validation/normalization helpers for quick links. Kept free of I/O so
 * they are unit-testable without a database.
 */

import { normalizeEventColor } from "@/lib/events/eventColors";
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
  const value = raw.trim();
  if (!value || value.length > QUICK_LINK_LABEL_MAX_LENGTH) {
    return null;
  }
  return value;
}

/**
 * Normalize a link URL: trimmed; an empty string means "not set". Returns
 * null when the value is not a valid http(s) URL (only http/https may be
 * opened, so `javascript:` & co. are rejected).
 */
export function normalizeQuickLinkUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) {
    return "";
  }
  if (value.length > QUICK_LINK_URL_MAX_LENGTH) {
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

  const label = values.label.trim();
  if (!label) {
    errors.label = "Label is required";
  } else if (label.length > QUICK_LINK_LABEL_MAX_LENGTH) {
    errors.label = `Label must be ${QUICK_LINK_LABEL_MAX_LENGTH} characters or fewer`;
  }

  const url = values.url.trim();
  if (!url) {
    errors.url = "URL is required";
  } else if (url.length <= QUICK_LINK_URL_MAX_LENGTH) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        errors.url = "URL must start with http:// or https://";
      }
    } catch {
      errors.url = "Enter a valid URL";
    }
  } else {
    errors.url = `URL must be ${QUICK_LINK_URL_MAX_LENGTH} characters or fewer`;
  }

  return errors;
}
