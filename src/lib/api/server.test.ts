import { describe, expect, it } from "vitest";
import type { Session } from "next-auth";

import { apiError, apiJson, withApiJson, withApiSession, type ApiGuardDeps } from "./server";

const userSession = {
  user: { id: "11111111-1111-1111-1111-111111111111", name: "Alice", role: "user" },
} as unknown as Session;

const adminSession = {
  user: { id: "admin", name: "Admin", role: "admin" },
} as unknown as Session;

function deps(session: Session | null): ApiGuardDeps {
  return { getSession: (async () => session) as unknown as ApiGuardDeps["getSession"] };
}

function request(headers: Record<string, string> = {}, body?: string): Request {
  return new Request("http://localhost/api/test", {
    method: body === undefined ? "GET" : "POST",
    headers,
    ...(body === undefined ? {} : { body }),
  });
}

describe("withApiSession", () => {
  it("rejects a write without the CSRF header before reading the session", async () => {
    const result = await withApiSession(request(), { requireApiHeader: true }, deps(adminSession));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      expect(result.response.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("rejects an unauthenticated caller", async () => {
    const result = await withApiSession(request(), {}, deps(null));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });

  it("returns the session for an authenticated GET", async () => {
    const result = await withApiSession(request(), {}, deps(userSession));
    expect(result).toEqual({ ok: true, session: userSession });
  });

  it("returns a JSON 403 (not a redirect) for a non-admin on an admin route", async () => {
    const result = await withApiSession(
      request({ "x-cloudy2-api": "1" }),
      { requireApiHeader: true, admin: true },
      deps(userSession),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      expect(await result.response.json()).toEqual({ ok: false, error: "Admins only" });
    }
  });
});

describe("withApiJson", () => {
  it("parses a valid body", async () => {
    const result = await withApiJson<{ x: number }>(
      request({ "x-cloudy2-api": "1" }, JSON.stringify({ x: 1 })),
      {},
      deps(userSession),
    );
    expect(result).toEqual({ ok: true, session: userSession, body: { x: 1 } });
  });

  it("returns a 400 for a malformed body", async () => {
    const result = await withApiJson(
      request({ "x-cloudy2-api": "1" }, "{"),
      {},
      deps(userSession),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
    }
  });
});

describe("apiJson / apiError", () => {
  it("always carries no-store", async () => {
    const ok = apiJson({ ok: true });
    expect(ok.headers.get("cache-control")).toBe("no-store");
    expect(await ok.json()).toEqual({ ok: true });

    const err = apiError(500, "Nope");
    expect(err.status).toBe(500);
    expect(err.headers.get("cache-control")).toBe("no-store");
    expect(await err.json()).toEqual({ ok: false, error: "Nope" });
  });
});
