/**
 * Pure, I/O-free helpers for reading Google service-account credentials from
 * the environment. Kept free of side effects so they can be unit-tested.
 */

export interface ServiceAccountConfig {
  clientEmail: string;
  privateKey: string;
}

export type GoogleEnv = Record<string, string | undefined>;

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

/**
 * Parse the service account credentials from the environment. Prefers the
 * base64-encoded JSON key (`GOOGLE_SERVICE_ACCOUNT_BASE64`), falling back to
 * the individual `GOOGLE_CLIENT_EMAIL` / `GOOGLE_PRIVATE_KEY` fields. Returns
 * null when nothing usable is configured.
 */
export function getServiceAccountConfig(
  env: GoogleEnv = process.env,
): ServiceAccountConfig | null {
  const base64 = env.GOOGLE_SERVICE_ACCOUNT_BASE64?.trim();
  if (base64) {
    try {
      const parsed = JSON.parse(Buffer.from(base64, "base64").toString("utf8")) as Record<
        string,
        unknown
      >;
      const clientEmail = typeof parsed.client_email === "string" ? parsed.client_email.trim() : "";
      const privateKey = typeof parsed.private_key === "string" ? parsed.private_key.trim() : "";
      if (clientEmail && privateKey) {
        return { clientEmail, privateKey };
      }
    } catch {
      // Malformed base64 — fall through to the individual env vars.
    }
  }

  const clientEmail = env.GOOGLE_CLIENT_EMAIL?.trim();
  const privateKey = env.GOOGLE_PRIVATE_KEY?.trim();
  if (clientEmail && privateKey) {
    // Keys pasted into env files commonly arrive with escaped newlines.
    return { clientEmail, privateKey: privateKey.replace(/\\n/g, "\n") };
  }

  return null;
}

/** Whether Google service-account credentials are present in the environment. */
export function hasGoogleCredentials(env: GoogleEnv = process.env): boolean {
  return getServiceAccountConfig(env) !== null;
}

/**
 * The admin Google account (`GOOGLE_DELEGATE_EMAIL`) that gets owner access to
 * every department calendar. Empty when not configured.
 */
export function getAdminGoogleEmail(env: GoogleEnv = process.env): string {
  return env.GOOGLE_DELEGATE_EMAIL?.trim() ?? "";
}
