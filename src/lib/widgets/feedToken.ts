/**
 * Signed, regenerable URLs for the calendar-feed (`.ics`) subscriptions.
 *
 * Calendar apps cannot set an `Authorization` header, and a feed URL is
 * subscribed once and then stored by the calendar app, so it must be a bearer
 * credential. Unlike `widget_tokens`, the feed URL is **derived** rather than
 * stored: an HMAC over `(userId, feedVersion, viewId)` keyed by
 * `NEXTAUTH_SECRET` (domain-separated). That lets the Profile → Widgets dialog
 * re-display the current URL at any time.
 *
 * Revocation is the per-user `user_preferences.feed_version` counter: rotating
 * the link increments it, so every previously generated URL fails. Rotating
 * `NEXTAUTH_SECRET` invalidates every feed (and every session), the same
 * trade-off as the dashboard share links.
 *
 * Server-only (`node:crypto`).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import { isUuid } from "@/lib/uuid";

const SIGNATURE_CONTEXT = "cloudy2:widget-feed:v1:";
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_VERSION = 999_999_999;

/** The HMAC key, or null when the required auth secret is absent. */
export function feedTokenSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const secret = env.NEXTAUTH_SECRET?.trim();
  return secret ? secret : null;
}

export function feedSignature(
  secret: string,
  userId: string,
  version: number,
  viewId: string,
): string {
  return createHmac("sha256", secret)
    .update(SIGNATURE_CONTEXT)
    .update(`${userId}:${version}:${viewId}`)
    .digest("base64url");
}

/**
 * Whether a presented signature matches the expected one. Length-checked and
 * compared with `timingSafeEqual` so a wrong signature cannot leak the digest.
 */
export function verifyFeedSignature(params: {
  secret: string;
  userId: string;
  version: number;
  viewId: string;
  signature: string | null | undefined;
}): boolean {
  const { signature } = params;
  if (typeof signature !== "string" || !SIGNATURE_PATTERN.test(signature)) {
    return false;
  }
  const expected = feedSignature(params.secret, params.userId, params.version, params.viewId);
  const providedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

/** Parse the `v` query param: a bounded non-negative integer, or null. */
export function parseFeedVersion(raw: string | null | undefined): number | null {
  if (typeof raw !== "string" || !/^(0|[1-9]\d{0,8})$/.test(raw)) {
    return null;
  }
  const value = Number(raw);
  return Number.isSafeInteger(value) && value <= MAX_VERSION ? value : null;
}

/**
 * Build the absolute feed URL for one view, or null when the inputs are not
 * signable (non-UUID ids, invalid version, trailing-slash origin is fine).
 */
export function signFeedUrl(params: {
  origin: string;
  userId: string;
  version: number;
  viewId: string;
  signatureSecret: string;
}): string | null {
  if (!isUuid(params.userId) || !isUuid(params.viewId)) {
    return null;
  }
  if (
    !Number.isSafeInteger(params.version) ||
    params.version < 0 ||
    params.version > MAX_VERSION
  ) {
    return null;
  }
  const signature = feedSignature(
    params.signatureSecret,
    params.userId,
    params.version,
    params.viewId,
  );
  const query = new URLSearchParams({
    u: params.userId,
    v: String(params.version),
    view: params.viewId,
    sig: signature,
  });
  const base = params.origin.replace(/\/+$/, "");
  return `${base}/api/widget/v1/calendar.ics?${query.toString()}`;
}
