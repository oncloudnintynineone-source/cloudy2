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
  return apiError(401, "Unauthorized");
}

/** JSON 403 for an authenticated caller without the required role. */
export function forbidden(error = "Forbidden"): NextResponse {
  return apiError(403, error);
}

/** JSON response with the app's no-store header. */
export function apiJson<T>(data: T): NextResponse {
  return NextResponse.json(data, { headers: API_NO_STORE });
}

/** JSON error response with the app's no-store header. */
export function apiError(status: number, error: string): NextResponse {
  return NextResponse.json({ ok: false, error }, { status, headers: API_NO_STORE });
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

/** The guard result: the session, or the response to return as-is. */
export type ApiGuardResult =
  | { ok: true; session: Session }
  | { ok: false; response: NextResponse };

export interface ApiGuardDeps {
  getSession: typeof getSession;
}

const REAL_GUARD_DEPS: ApiGuardDeps = { getSession };

export interface ApiGuardOptions {
  /** Require the `x-cloudy2-api` CSRF header (all writes). */
  requireApiHeader?: boolean;
  /** Require an admin session; returns a JSON 403 (never a redirect). */
  admin?: boolean;
}

/**
 * The shared route-handler preamble: CSRF header → session → optional admin.
 * Returns the response to return on failure so a route writes no branching.
 */
export async function withApiSession(
  request: Request,
  options: ApiGuardOptions = {},
  deps: ApiGuardDeps = REAL_GUARD_DEPS,
): Promise<ApiGuardResult> {
  if (options.requireApiHeader === true && !isApiRequest(request)) {
    return { ok: false, response: unauthorized() };
  }
  const session = await deps.getSession();
  if (!session?.user) {
    return { ok: false, response: unauthorized() };
  }
  if (options.admin === true && session.user.role !== "admin") {
    return { ok: false, response: forbidden("Admins only") };
  }
  return { ok: true, session };
}

/**
 * CSRF + session + JSON body in one call. A malformed body gets the standard
 * 400; callers that need a custom message use {@link withApiSession} +
 * {@link readApiJson} instead.
 */
export async function withApiJson<T>(
  request: Request,
  options: Omit<ApiGuardOptions, "requireApiHeader"> = {},
  deps: ApiGuardDeps = REAL_GUARD_DEPS,
): Promise<{ ok: true; session: Session; body: T } | { ok: false; response: NextResponse }> {
  const auth = await withApiSession(request, { ...options, requireApiHeader: true }, deps);
  if (!auth.ok) {
    return auth;
  }
  const body = await readApiJson<T>(request);
  if (body === null) {
    return { ok: false, response: apiError(400, "Invalid request") };
  }
  return { ok: true, session: auth.session, body };
}
