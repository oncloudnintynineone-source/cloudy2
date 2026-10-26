/**
 * Self-contained, signed tokens for shared dashboard views.
 *
 * A share link carries no server-side row: the view definition (name, kind and
 * the sharer's *effective* filters) is Brotli-compressed, base64url-encoded and
 * signed with HMAC-SHA256 keyed by `NEXTAUTH_SECRET` (domain-separated). This
 * keeps the URL tamper-evident without a schema migration or a revocation list.
 * The trade-off is explicit: links cannot be revoked individually, and rotating
 * the auth secret invalidates every link.
 *
 * Server-only by usage (node:crypto + node:zlib); never import from a client
 * component. The payload is validated again on decode, and the route/add
 * actions re-resolve filter ids against live data before using them.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { brotliCompressSync, brotliDecompressSync } from "node:zlib";

import {
  DASHBOARD_VIEW_NAME_MAX_LENGTH,
  isDashboardViewKind,
  type DashboardViewKind,
} from "./views";

/** Bump only with an explicit decode path for the previous version. */
export const SHARE_TOKEN_VERSION = 1;

/** Refuse to generate links longer than this (they get impractical to send). */
export const MAX_SHARE_TOKEN_LENGTH = 6_000;

/** Decompressed payload guard (the token itself is tiny for normal views). */
const MAX_SHARE_PAYLOAD_BYTES = 64 * 1024;

/** Bound each filter list so a corrupt/hostile payload cannot be unbounded. */
const MAX_FILTER_VALUES = 500;

const MAX_FILTER_VALUE_LENGTH = 200;
const MAX_SHARER_NAME_LENGTH = 80;

const SIGNATURE_CONTEXT = "cloudy2:view-share:v1:";

/**
 * The serialized view definition. Short keys keep the URL compact; the codec
 * is the only reader, so the field names are not a public contract.
 */
export interface DashboardViewSharePayload {
  v: typeof SHARE_TOKEN_VERSION;
  /** View name. */
  n: string;
  /** Renderer kind. */
  k: DashboardViewKind;
  /** Resolved calendar ids (never null). */
  c: string[];
  /** Resolved roster user ids (never null; empty = any). */
  u: string[];
  /** Resolved event-type names (never null; empty = any). */
  t: string[];
  /** Sharer display name (best-effort, empty when unavailable). */
  b: string;
}

export type EncodeShareTokenResult =
  | { ok: true; token: string }
  | { ok: false; error: string };

/** The HMAC key, or null when the required auth secret is absent. */
export function shareTokenSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const secret = env.NEXTAUTH_SECRET?.trim();
  return secret ? secret : null;
}

function signatureFor(body: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(SIGNATURE_CONTEXT)
    .update(body)
    .digest("base64url");
}

function isStringList(value: unknown, maxLength: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_FILTER_VALUES &&
    value.every(
      (entry) =>
        typeof entry === "string" &&
        entry.length > 0 &&
        entry.length <= maxLength,
    )
  );
}

/** Validate a decoded object into the typed payload, or null. */
export function normalizeSharePayload(raw: unknown): DashboardViewSharePayload | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const value = raw as Record<string, unknown>;
  if (value.v !== SHARE_TOKEN_VERSION || !isDashboardViewKind(value.k)) {
    return null;
  }
  if (typeof value.n !== "string") {
    return null;
  }
  const name = value.n.trim();
  if (name.length === 0 || name.length > DASHBOARD_VIEW_NAME_MAX_LENGTH) {
    return null;
  }
  if (
    !isStringList(value.c, MAX_FILTER_VALUE_LENGTH) ||
    !isStringList(value.u, MAX_FILTER_VALUE_LENGTH) ||
    !isStringList(value.t, MAX_FILTER_VALUE_LENGTH) ||
    typeof value.b !== "string" ||
    value.b.length > MAX_SHARER_NAME_LENGTH
  ) {
    return null;
  }
  return {
    v: SHARE_TOKEN_VERSION,
    n: name,
    k: value.k,
    c: value.c,
    u: value.u,
    t: value.t,
    b: value.b,
  };
}

/**
 * Serialize, compress, sign and URL-safe-encode a view definition. Returns a
 * friendly error when the resulting link would be too long to share reliably.
 */
export function encodeDashboardViewShare(
  payload: DashboardViewSharePayload,
  secret: string,
): EncodeShareTokenResult {
  const normalized = normalizeSharePayload(payload);
  if (!normalized) {
    return { ok: false, error: "This view could not be shared" };
  }
  try {
    const compressed = brotliCompressSync(Buffer.from(JSON.stringify(normalized), "utf8"));
    const body = compressed.toString("base64url");
    const token = `${body}.${signatureFor(body, secret)}`;
    if (token.length > MAX_SHARE_TOKEN_LENGTH) {
      return {
        ok: false,
        error:
          "This view has too many selected filters to share as a link. Narrow the filters and try again.",
      };
    }
    return { ok: true, token };
  } catch {
    return { ok: false, error: "This view could not be shared" };
  }
}

/**
 * Verify and decode a share token. Any tampering, format drift or decompression
 * failure is a clean null (the caller shows the invalid-link state).
 */
export function decodeDashboardViewShare(
  token: string,
  secret: string,
): DashboardViewSharePayload | null {
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_SHARE_TOKEN_LENGTH) {
    return null;
  }
  const dot = token.indexOf(".");
  if (dot <= 0 || dot >= token.length - 1) {
    return null;
  }
  const body = token.slice(0, dot);
  const provided = token.slice(dot + 1);
  const expected = signatureFor(body, secret);
  const providedBuffer = Buffer.from(provided, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }
  try {
    const json = brotliDecompressSync(Buffer.from(body, "base64url"), {
      maxOutputLength: MAX_SHARE_PAYLOAD_BYTES,
    }).toString("utf8");
    return normalizeSharePayload(JSON.parse(json));
  } catch {
    return null;
  }
}
