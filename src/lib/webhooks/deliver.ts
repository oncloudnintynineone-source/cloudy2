/**
 * Fire-and-forget webhook delivery for event mutations. Reads the singleton
 * settings once at mutation time, then hands the signed POST to `after()` so
 * the server action's response is never delayed by the external system. Any
 * failure — missing config, network error, non-2xx response — is logged to
 * the console and swallowed: delivery is best-effort, mirroring `logAction`.
 */

import { after } from "next/server";

import { getSettings } from "@/lib/settings/queries";
import { buildEventWebhookPayload, type EventWebhookPayload } from "./payload";
import { webhookSignature } from "./sign";

const WEBHOOK_TIMEOUT_MS = 10_000;

/** Headers sent with every webhook delivery (signature added when secret set). */
function webhookHeaders(
  payload: EventWebhookPayload,
  body: string,
  timestamp: string,
  secret: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Cloudy2-Event": payload.action,
    "X-Cloudy2-Timestamp": timestamp,
  };
  if (secret) {
    headers["X-Cloudy2-Signature"] = `sha256=${webhookSignature(secret, timestamp, body)}`;
  }
  return headers;
}

/**
 * Queue a webhook notification for one event mutation. Safe to call on every
 * successful create/update/delete: with no webhook configured it is a no-op,
 * and it never throws.
 */
export async function dispatchEventWebhook(input: Parameters<
  typeof buildEventWebhookPayload
>[0]): Promise<void> {
  try {
    const settings = await getSettings();
    if (!settings.webhookEnabled || !settings.webhookUrl) {
      return;
    }

    const url = settings.webhookUrl;
    const secret = settings.webhookSecret || null;
    const payload = buildEventWebhookPayload(input);
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const headers = webhookHeaders(payload, body, timestamp, secret);

    after(async () => {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers,
          body,
          signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
        });
        if (!response.ok) {
          console.error(`[webhook] Delivery to ${url} failed with HTTP ${response.status}`);
        }
      } catch (error) {
        console.error("[webhook] Delivery failed", error);
      }
    });
  } catch (error) {
    console.error("[webhook] Failed to prepare webhook delivery", error);
  }
}
