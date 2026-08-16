import { hasGoogleCredentials } from "./config";
import { createRealGoogleIntegration } from "./real";
import { stubGoogleIntegration } from "./stub";
import type { GoogleIntegration } from "./types";

export type { GoogleIntegration, GcalEvent, GcalEventInput, GoogleCalendarInfo } from "./types";

/** Whether real Google service-account credentials are configured. */
export function googleCalendarConfigured(): boolean {
  return hasGoogleCredentials();
}

/**
 * Returns the active Google integration — the real service-account client when
 * credentials are configured, otherwise a no-op stub. Callers that must surface
 * "Google is unavailable" can check `googleCalendarConfigured()` first.
 */
export async function getGoogleIntegration(): Promise<GoogleIntegration> {
  return googleCalendarConfigured() ? createRealGoogleIntegration() : stubGoogleIntegration;
}
