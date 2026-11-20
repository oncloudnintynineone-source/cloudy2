/**
 * Pure single-line text helpers shared by the admin forms. Kept free of I/O so
 * they unit-test without a database.
 */

/** Trim a required single-line value; null when empty or over the cap. */
export function trimToMax(raw: string, maxLength: number): string | null {
  const value = raw.trim();
  if (!value || value.length > maxLength) {
    return null;
  }
  return value;
}

export interface RequiredTextMessages {
  requiredMessage: string;
  /** Message for a value above `maxLength`. */
  maxMessage: string;
}

/** Validate a trimmed required single-line value. */
export function validateRequiredText(
  raw: string,
  maxLength: number,
  messages: RequiredTextMessages,
): string | undefined {
  const value = raw.trim();
  if (!value) {
    return messages.requiredMessage;
  }
  if (value.length > maxLength) {
    return messages.maxMessage;
  }
  return undefined;
}
