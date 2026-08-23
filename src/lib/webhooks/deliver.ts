/**
 * Fire-and-forget webhook delivery for event mutations. Reads the enabled
 * endpoints once at mutation time, then hands the signed POSTs to `after()` so
 * the server action's response is never delayed by external systems. Each
 * endpoint is delivered independently — one receiver being slow, broken, or
 * misconfigured never affects the others. Any failure is logged to the
 * console and swallowed: delivery is best-effort, mirroring `logAction`.
 */

import { after } from "next/server";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { webhooks } from "@/db/schema";
import { buildEventWebhookPayload, type EventWebhookPayload } from "./payload";
import { webhookSignature } from "./sign";

const WEBHOOK_TIMEOUT_MS = 10_000;

/** Headers sent with every webhook delivery (signature added when secret set). */
function webhookHeaders(
  action: EventWebhookPayload["action"],
  body: string,
  timestamp: string,
  secret: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Cloudy2-Event": action,
    "X-Cloudy2-Timestamp": timestamp,
  };
  if (secret) {
    headers["X-Cloudy2-Signature"] = `sha256=${webhookSignature(secret, timestamp, body)}`;
  }
  return headers;
}

/** One endpoint delivery; resolves on any response, rejects only on network error. */
async function postWebhook(endpoint: {
  name: string;
  url: string;
  secret: string | null;
}, body: string, timestamp: string, action: EventWebhookPayload["action"]): Promise<void> {
  try {
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: webhookHeaders(action, body, timestamp, endpoint.secret),
      body,
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(
        `[webhook:${endpoint.name}] Delivery to ${endpoint.url} failed with HTTP ${response.status}`,
      );
    }
  } catch (error) {
    console.error(`[webhook:${endpoint.name}] Delivery to ${endpoint.url} failed`, error);
  }
}

/**
 * Queue a webhook notification for one event mutation, fanned out to every
 * enabled endpoint. Safe to call on every successful create/update/delete:
 * with no endpoints configured it is a no-op, and it never throws.
 */
export async function dispatchEventWebhook(input: Parameters<
  typeof buildEventWebhookPayload
>[0]): Promise<void> {
  let endpoints: { name: string; url: string; secret: string | null }[];
  try {
    endpoints = await db
      .select({ name: webhooks.name, url: webhooks.url, secret: webhooks.secret })
      .from(webhooks)
      .where(eq(webhooks.enabled, true));
  } catch (error) {
    console.error("[webhook] Failed to read webhook endpoints", error);
    return;
  }

  if (endpoints.length === 0) {
    return;
  }

  const payload = buildEventWebhookPayload(input);
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();

  after(async () => {
    await Promise.allSettled(endpoints.map((endpoint) =>
      postWebhook(endpoint, body, timestamp, payload.action)
    ));
  });
}
