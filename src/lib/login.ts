/**
 * Pure helpers for resolving a login input into a phone number. Kept free of
 * I/O so they can be unit tested without a database.
 *
 * The login page is a single masked field (`src/components/LoginForm.tsx`):
 * `parseUserLogin` handles the staff `[phone]<keyword>` form (an admin-role
 * user is then prompted for the shared admin PIN), and `normalizePhoneDigits`
 * normalizes the phone the PIN modal submits for a named admin.
 */

/**
 * Reduce an arbitrary phone entry to its trailing 8 digits — the canonical
 * phone used everywhere in the roster. Returns null when fewer than 8 digits
 * survive (the app cannot address that person).
 */
export function normalizePhoneDigits(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8) {
    return null;
  }
  return digits.slice(-8);
}

/**
 * Staff sign-in: if the raw input ends with the configured user keyword,
 * strip the keyword and return the trailing 8 digits as the canonical phone
 * number. Otherwise return null.
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
  return normalizePhoneDigits(phonePart);
}

/**
 * Sanitize the login page's `?next=` return target. Only an internal absolute
 * path (optionally with a query) is allowed; protocol-relative URLs, absolute
 * URLs, backslash tricks and the login page itself are rejected. Keeps one-shot
 * share links (`/share/<token>`) working without creating an open redirect.
 */
export function sanitizeNextPath(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const value = raw.trim();
  if (value.length === 0 || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value, "https://cloudy2.invalid");
  } catch {
    return null;
  }
  if (url.origin !== "https://cloudy2.invalid") {
    return null;
  }
  if (url.pathname === "/login" || url.pathname.startsWith("/login/")) {
    return null;
  }
  return `${url.pathname}${url.search}`;
}
