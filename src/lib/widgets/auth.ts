/**
 * Cookie-less authentication for the widget API. The widget clients are native
 * apps, so they cannot carry the NextAuth session cookie; they present a
 * per-device `widget_tokens` credential instead.
 *
 * Credential sources, in order:
 * - `Authorization: Bearer <token>` (Scriptable, Widgy, Tasker);
 * - `?token=<token>` (KWGT/Kustom's `wg()`/Flow WebGet cannot set headers).
 *
 * Every request re-checks that the token is not revoked and its owner is still
 * active, so deactivating a roster user cuts widget access immediately.
 */

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { users, widgetTokens } from "@/db/schema";
import { API_NO_STORE, unauthorized } from "@/lib/api/server";

import { checkWidgetRateLimit } from "./rateLimit";
import { hashWidgetToken, parseWidgetToken } from "./tokens";

/** The user a widget token belongs to. */
export interface WidgetActor {
  id: string;
  name: string;
  role: "admin" | "user";
  phone: string | null;
}

export type WidgetAuthResult =
  | { ok: true; actor: WidgetActor }
  | { ok: false; response: NextResponse };

/** A successful read updates `last_used_at` at most this often. */
const LAST_USED_THROTTLE_MS = 5 * 60_000;

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

function queryToken(request: Request): string | null {
  try {
    return new URL(request.url).searchParams.get("token");
  } catch {
    return null;
  }
}

function tooManyRequests(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Too many requests" },
    {
      status: 429,
      headers: { ...API_NO_STORE, "Retry-After": String(retryAfterSec) },
    },
  );
}

function lookupFailed(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Could not verify the widget token" },
    { status: 500, headers: API_NO_STORE },
  );
}

/**
 * Resolve a widget request to its owner, or produce the error response to
 * return. Never throws.
 */
export async function authenticateWidgetRequest(request: Request): Promise<WidgetAuthResult> {
  const token = parseWidgetToken(bearerToken(request)) ?? parseWidgetToken(queryToken(request));
  if (!token) {
    return { ok: false, response: unauthorized() };
  }

  const tokenHash = hashWidgetToken(token);
  const limit = checkWidgetRateLimit(tokenHash);
  if (!limit.allowed) {
    return { ok: false, response: tooManyRequests(limit.retryAfterSec) };
  }

  let row:
    | {
        tokenId: string;
        lastUsedAt: Date | null;
        revokedAt: Date | null;
        userId: string;
        name: string;
        role: "admin" | "user";
        phone: string | null;
        status: "active" | "inactive";
      }
    | undefined;
  try {
    [row] = await db
      .select({
        tokenId: widgetTokens.id,
        lastUsedAt: widgetTokens.lastUsedAt,
        revokedAt: widgetTokens.revokedAt,
        userId: users.id,
        name: users.name,
        role: users.role,
        phone: users.phone,
        status: users.status,
      })
      .from(widgetTokens)
      .innerJoin(users, eq(users.id, widgetTokens.userId))
      .where(eq(widgetTokens.tokenHash, tokenHash))
      .limit(1);
  } catch (error) {
    console.error("[widgets] Token lookup failed", error);
    return { ok: false, response: lookupFailed() };
  }

  if (!row || row.revokedAt !== null || row.status !== "active") {
    return { ok: false, response: unauthorized() };
  }

  // Best-effort bookkeeping: a failure here must never fail the read.
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS) {
    try {
      await db
        .update(widgetTokens)
        .set({ lastUsedAt: new Date(), updatedAt: new Date() })
        .where(eq(widgetTokens.id, row.tokenId));
    } catch (error) {
      console.error("[widgets] Failed to record token use", error);
    }
  }

  return {
    ok: true,
    actor: { id: row.userId, name: row.name, role: row.role, phone: row.phone },
  };
}
