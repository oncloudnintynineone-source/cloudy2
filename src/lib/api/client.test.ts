import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, getJson, isAbortError, isUnauthorized, postJson } from "./client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("postJson", () => {
  it("sends the API marker/JSON body and returns the parsed payload", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ ok: true, value: 3 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(postJson("/api/x", { a: 1 })).resolves.toEqual({ ok: true, value: 3 });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/x");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ a: 1 }));
    expect(init?.credentials).toBe("same-origin");
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers["x-cloudy2-api"]).toBe("1");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("throws an ApiError carrying the server's message and status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ ok: false, error: "Nope" }, 401)));

    await expect(getJson("/api/x")).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
      message: "Nope",
    });
  });
});

describe("error predicates", () => {
  it("recognises a session-expiry response", () => {
    expect(isUnauthorized(new ApiError(401, "Unauthorized"))).toBe(true);
    expect(isUnauthorized(new ApiError(500, "boom"))).toBe(false);
    expect(isUnauthorized(new Error("Unauthorized"))).toBe(false);
  });

  it("recognises an aborted request", () => {
    expect(isAbortError(new DOMException("aborted", "AbortError"))).toBe(true);
    expect(isAbortError(new Error("boom"))).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });
});
