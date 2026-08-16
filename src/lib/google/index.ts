import { stubGoogleIntegration } from "./stub";
import type { GoogleIntegration } from "./types";

export type { GoogleIntegration, GcalEvent, GcalEventInput } from "./types";

let cached: GoogleIntegration | null = null;

/**
 * Returns the active Google integration. Real implementation is wired in a
 * later phase once service-account credentials are provisioned; until then a
 * no-op stub keeps the app runnable.
 */
export async function getGoogleIntegration(): Promise<GoogleIntegration> {
  if (cached) {
    return cached;
  }
  cached = stubGoogleIntegration;
  return cached;
}
