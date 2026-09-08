/**
 * Pure VAPID config parsing for the Web Push channel. The public key is read
 * from `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (so the same value is inlined for the
 * client's `pushManager.subscribe` at build time and available to the server at
 * runtime), the private key and subject are server-only. A single pair of keys
 * is shared across environments — the keys identify the application server,
 * they are not per-environment secrets in the sense of the Neon/Google creds,
 * but the private key must still be mirrored to every deploy surface.
 *
 * Push is skipped entirely (gracefully) until all three vars are present.
 */

export type VapidEnv = Record<string, string | undefined>;

/** The VAPID public key (URL-safe base64), or null when unset. */
export function vapidPublicKey(env: VapidEnv = process.env): string | null {
  const value = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export interface VapidConfig {
  /** `mailto:` (or `https:` URL) contact identifying the application server. */
  subject: string;
  publicKey: string;
  privateKey: string;
}

/**
 * The full server-side VAPID config, or null when any of the three vars is
 * missing (web push is then disabled). Reads from `process.env` by default so
 * callers in the actions/dispatch path need no wiring.
 */
export function parseVapidConfig(env: VapidEnv = process.env): VapidConfig | null {
  const publicKey = vapidPublicKey(env);
  const privateKey = typeof env.VAPID_PRIVATE_KEY === "string" ? env.VAPID_PRIVATE_KEY.trim() : "";
  const subject = typeof env.VAPID_SUBJECT === "string" ? env.VAPID_SUBJECT.trim() : "";
  if (!publicKey || !privateKey || !subject) {
    return null;
  }
  return { subject, publicKey, privateKey };
}
