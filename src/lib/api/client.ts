/**
 * Client-side helper for the app's read APIs.
 *
 * Background and data reads are plain `fetch` calls to `/api/*` route handlers
 * rather than Next server actions so they never enter the App Router's
 * single-flight server-action queue (a long preload could otherwise delay the
 * user's next save or month read — see docs/loading-transitions.md). Every
 * request carries `x-cloudy2-api`, which the route handlers require on writes
 * (a cross-origin request cannot send it without a CORS preflight the server
 * never allows).
 *
 * Kept free of server imports so it can be used from any client component.
 */

export class ApiError extends Error {
  /** HTTP status of the failed response (0 for a network failure). */
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Whether a request failed because the session is no longer valid. */
export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

/** Whether a request was aborted by its caller (superseded navigation). */
export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

type ApiRequestInit = RequestInit & { priority?: "high" | "low" | "auto" };

async function request<T>(url: string, init: ApiRequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "x-cloudy2-api": "1",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? ((await response.json().catch(() => null)) as unknown)
    : null;

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `Request failed (${response.status})`;
    throw new ApiError(response.status, message);
  }

  return payload as T;
}

export function getJson<T>(
  url: string,
  options?: { signal?: AbortSignal; priority?: "high" | "low" | "auto" },
): Promise<T> {
  return request<T>(url, { method: "GET", signal: options?.signal, priority: options?.priority });
}

export function postJson<T>(
  url: string,
  body: unknown,
  options?: { signal?: AbortSignal; priority?: "high" | "low" | "auto" },
): Promise<T> {
  return request<T>(url, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
    signal: options?.signal,
    priority: options?.priority,
  });
}
