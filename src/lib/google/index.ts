import { hasGoogleCredentials } from "./config";
import { stubGoogleIntegration } from "./stub";
import type { GoogleIntegration } from "./types";

export type {
  GcalEvent,
  GcalEventInput,
  GcalEventItem,
  GoogleCalendarInfo,
  GoogleIntegration,
} from "./types";

/** Whether real Google service-account credentials are configured. */
export function googleCalendarConfigured(): boolean {
  return hasGoogleCredentials();
}

/**
 * Returns the active Google integration — the real service-account client when
 * credentials are configured, otherwise a no-op stub. Callers that must surface
 * "Google is unavailable" can check `googleCalendarConfigured()` first.
 *
 * `./real` is loaded with a dynamic `import()` on purpose: its first line is
 * `import { google } from "googleapis"`, and the umbrella googleapis package is
 * one of the heaviest requires in npm. A static import here would put it in the
 * module graph of every route that touches this barrel — including
 * /dashboard — so a cold serverless boot paid to load the whole Google API
 * surface *before rendering started*, blocking the first byte and therefore
 * first paint (the Android PWA splash stays up until first paint). Loading it
 * lazily means a request served entirely from the event cache never touches
 * googleapis at all. Keep this dynamic, and keep `googleCalendarConfigured()`
 * on ./config (env-only, googleapis-free) so callers can probe without paying
 * the load. See docs/pwa-offline.md §1.5.1.
 */
export async function getGoogleIntegration(): Promise<GoogleIntegration> {
  if (!googleCalendarConfigured()) return stubGoogleIntegration;
  const { createRealGoogleIntegration } = await import("./real");
  return createRealGoogleIntegration();
}
