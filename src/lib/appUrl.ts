import { headers } from "next/headers";

/**
 * Public origin of the app for the current request (e.g.
 * "https://calendar.example.com"), derived from the incoming headers so no
 * extra env config is needed. Used to build links that must point back at the
 * app itself (e.g. the "Edit:" link stored in Google Calendar event notes).
 */
export async function appBaseUrl(): Promise<string> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const proto = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http";
  return `${proto}://${host}`;
}
