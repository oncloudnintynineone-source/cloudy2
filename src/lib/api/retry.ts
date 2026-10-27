import { ApiError, isAbortError } from "./client";

/**
 * Bounded retry for the shell's best-effort background reads (the pinned-events
 * ticker, the Double Booking and KAH badge counts). A cold launch can hit a
 * transiently failing backend (cold Cloud Run / Neon / Google path, a network
 * still coming up), and a single-shot read left the header pill stuck on its
 * static label for the whole session. These reads are idempotent GETs behind a
 * 60s server cache, so a short bounded retry is cheap and self-limiting.
 */
export const DEFAULT_RETRY_DELAYS_MS = [500, 1_500, 4_000] as const;

/**
 * Whether a failed read is worth another attempt. A caller abort (a superseded
 * navigation) and an invalid session (401/403 — the next navigation redirects
 * anyway) never are; everything else (5xx, network drop, timeout) is.
 */
export function isRetryableError(error: unknown): boolean {
  if (isAbortError(error)) {
    return false;
  }
  if (error instanceof ApiError) {
    return error.status !== 401 && error.status !== 403;
  }
  return true;
}

/**
 * Whether attempt `attempt` (0-based) of a failed read should be retried.
 * While the browser reports itself offline there is nothing to retry against —
 * the `online` event re-runs the read instead.
 */
export function shouldRetryRead(
  error: unknown,
  attempt: number,
  delays: readonly number[] = DEFAULT_RETRY_DELAYS_MS,
): boolean {
  if (attempt >= delays.length) {
    return false;
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return false;
  }
  return isRetryableError(error);
}

/** The backoff before retry `attempt` (the last delay repeats). */
export function retryDelayMs(
  attempt: number,
  delays: readonly number[] = DEFAULT_RETRY_DELAYS_MS,
): number {
  return delays[Math.min(attempt, delays.length - 1)] ?? 0;
}

/**
 * Run `task`, retrying a retryable failure after the backoff ladder
 * (`DEFAULT_RETRY_DELAYS_MS` by default). Rejects with the last error once the
 * ladder is exhausted or the failure is terminal.
 */
export async function runWithRetry<T>(
  task: () => Promise<T>,
  options: { delays?: readonly number[] } = {},
): Promise<T> {
  const delays = options.delays ?? DEFAULT_RETRY_DELAYS_MS;
  let attempt = 0;
  for (;;) {
    try {
      return await task();
    } catch (error) {
      if (!shouldRetryRead(error, attempt, delays)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempt, delays)));
      attempt += 1;
    }
  }
}
