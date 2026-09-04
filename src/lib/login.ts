/**
 * Pure helpers for resolving login inputs into a phone number. Kept free of
 * I/O so it can be unit tested without a database.
 *
 * Sign-in has two explicit surfaces (`src/components/LoginForm.tsx`):
 * - staff: a single `[phone]<keyword>` input, parsed by `parseUserLogin`;
 * - admin: separate phone + secret fields, the phone normalized by
 *   `normalizePhoneDigits`.
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
