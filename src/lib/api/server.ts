/**
 * Server-side helpers for the app's read APIs (`/api/*` route handlers).
 *
 * These routes deliberately do not use `requireSession()`: that helper calls
 * `redirect()`, which a `fetch` caller would follow into the login page's HTML
 * and fail to parse. They return a JSON 401 instead, and the client treats it
 * as a session-expired read (keep the cached view / leave the page).
 */

import { NextResponse } from "next/server";
import type { Session } from "next-auth";

import { getSession } from "@/lib/session";

export const API_NO_STORE = { "Cache-Control": "no-store" } as const;

/** The current session, or null (never redirects). */
export function apiSession(): Promise<Session | null> {
  return getSession();
}

export function unauthorized(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Unauthorized" },
    { status: 401, headers: API_NO_STORE },
  );
}

/**
 * CSRF guard for side-effecting routes: a cross-origin caller cannot set this
 * header without a CORS preflight, and these routes never answer one.
 */
export function isApiRequest(request: Request): boolean {
  return request.headers.get("x-cloudy2-api") === "1";
}

export async function readApiJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/** A non-empty string body field, else null. */
export function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
