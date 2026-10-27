import { describe, expect, it } from "vitest";

import { ApiError } from "./client";
import {
  DEFAULT_RETRY_DELAYS_MS,
  isRetryableError,
  retryDelayMs,
  runWithRetry,
  shouldRetryRead,
} from "./retry";

describe("isRetryableError", () => {
  it("never retries an abort", () => {
    expect(isRetryableError(new DOMException("Aborted", "AbortError"))).toBe(false);
  });

  it("never retries an invalid session", () => {
    expect(isRetryableError(new ApiError(401, "expired"))).toBe(false);
    expect(isRetryableError(new ApiError(403, "forbidden"))).toBe(false);
  });

  it("retries server errors and network drops", () => {
    expect(isRetryableError(new ApiError(500, "boom"))).toBe(true);
    expect(isRetryableError(new ApiError(0, "offline"))).toBe(true);
    expect(isRetryableError(new TypeError("fetch failed"))).toBe(true);
  });
});

describe("shouldRetryRead", () => {
  it("stops once the ladder is exhausted", () => {
    const error = new ApiError(500, "boom");
    expect(shouldRetryRead(error, 0)).toBe(true);
    expect(shouldRetryRead(error, DEFAULT_RETRY_DELAYS_MS.length - 1)).toBe(true);
    expect(shouldRetryRead(error, DEFAULT_RETRY_DELAYS_MS.length)).toBe(false);
  });

  it("never retries a terminal status regardless of attempt", () => {
    expect(shouldRetryRead(new ApiError(401, "expired"), 0)).toBe(false);
  });
});

describe("retryDelayMs", () => {
  it("walks the ladder and repeats the last delay", () => {
    expect(retryDelayMs(0)).toBe(500);
    expect(retryDelayMs(1)).toBe(1500);
    expect(retryDelayMs(2)).toBe(4000);
    expect(retryDelayMs(99)).toBe(4000);
  });
});

describe("runWithRetry", () => {
  it("resolves without retrying on success", async () => {
    let calls = 0;
    const value = await runWithRetry(async () => ++calls);
    expect(value).toBe(1);
    expect(calls).toBe(1);
  });

  it("retries a retryable failure until it succeeds", async () => {
    let calls = 0;
    const value = await runWithRetry(async () => {
      calls += 1;
      if (calls < 3) {
        throw new ApiError(500, "boom");
      }
      return "ok";
    });
    expect(value).toBe("ok");
    expect(calls).toBe(3);
  });

  it("rejects immediately on a terminal failure", async () => {
    let calls = 0;
    await expect(
      runWithRetry(async () => {
        calls += 1;
        throw new ApiError(401, "expired");
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(calls).toBe(1);
  });

  it("rejects with the last error once the ladder is exhausted", async () => {
    let calls = 0;
    await expect(
      runWithRetry(
        async () => {
          calls += 1;
          throw new ApiError(500, "boom");
        },
        { delays: [0, 0] },
      ),
    ).rejects.toThrow("boom");
    expect(calls).toBe(3);
  });
});
