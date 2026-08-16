/**
 * Pure helpers for resolving a single login input into either an admin
 * password check or a user phone lookup. Kept free of I/O so it can be unit
 * tested without a database.
 */

export type LoginKind = "admin" | "user" | "unknown";

/**
 * If the raw input ends with the configured user keyword, strip the keyword
 * and return the trailing 8 digits as the canonical phone number. Otherwise
 * return null (the input is treated as an admin password candidate).
 */
export function parseUserLogin(input: string, keyword: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || !keyword) {
    return null;
  }
  if (!trimmed.endsWith(keyword)) {
    return null;
  }
  const phonePart = trimmed.slice(0, trimmed.length - keyword.length);
  const digits = phonePart.replace(/\D/g, "");
  if (digits.length < 8) {
    return null;
  }
  return digits.slice(-8);
}

/**
 * Decide how to interpret a login input before any DB/credential check.
 * Without a keyword or a stored admin hash, we cannot know whether the input
 * is a password or a phone; returns "unknown" and lets the caller fall back.
 */
export function classifyLogin(
  input: string,
  keyword: string,
  hasAdminPassword: boolean,
): LoginKind {
  if (!input || !input.trim()) {
    return "unknown";
  }
  if (keyword && input.trim().endsWith(keyword)) {
    return "user";
  }
  if (hasAdminPassword) {
    return "admin";
  }
  return "unknown";
}
