/**
 * Pure http(s) URL normalization/validation shared by quick links and webhook
 * endpoints. Kept free of I/O so it unit-tests without a database.
 */

/**
 * Trim a URL. An empty string means "not set"; `null` means the value is not a
 * valid http(s) URL (only http/https may be opened, so `javascript:` & co. are
 * rejected) or exceeds `maxLength`.
 */
export function normalizeHttpUrl(raw: string, maxLength: number): string | null {
  const value = raw.trim();
  if (!value) {
    return "";
  }
  if (value.length > maxLength) {
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

export interface HttpUrlValidationMessages {
  /** Returned when the URL exceeds `maxLength`. */
  tooLongMessage: string;
  /** Returned for a syntactically invalid URL. */
  invalidMessage: string;
  /** Returned for a non-http(s) scheme. */
  protocolMessage: string;
}

/**
 * Validate an optional-or-required URL (the caller handles the required case).
 * Returns `undefined` for an empty value.
 */
export function validateHttpUrl(
  raw: string,
  maxLength: number,
  messages: HttpUrlValidationMessages,
): string | undefined {
  const value = raw.trim();
  if (!value) {
    return undefined;
  }
  if (value.length > maxLength) {
    return messages.tooLongMessage;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return messages.protocolMessage;
    }
  } catch {
    return messages.invalidMessage;
  }
  return undefined;
}
