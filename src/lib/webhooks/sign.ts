/**
 * Pure signing helper for outbound webhooks. Receivers verify the
 * `X-Cloudy2-Signature` header by computing the same HMAC-SHA256 over
 * `${timestamp}.${body}` with their shared secret and comparing (constant-time
 * comparison recommended on the receiving side). The timestamp binds the
 * signature to a delivery window so replayed bodies are detectable.
 */

import { createHmac } from "node:crypto";

/** Hex HMAC-SHA256 of `${timestamp}.${body}` keyed by the shared secret. */
export function webhookSignature(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}
