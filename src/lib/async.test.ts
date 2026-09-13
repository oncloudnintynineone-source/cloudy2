import { describe, expect, it } from "vitest";

import { mapWithConcurrency, withTimeout } from "./async";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("mapWithConcurrency", () => {
  it("preserves input order in the result", async () => {
    const out = await mapWithConcurrency([3, 1, 2], 2, async (n) => n * 10);
    expect(out).toEqual([30, 10, 20]);
  });

  it("never runs more than `limit` promises at once", async () => {
    const d = [deferred<number>(), deferred<number>(), deferred<number>()];
    let inFlight = 0;
    let peak = 0;
    const running = mapWithConcurrency([0, 1, 2], 2, (i) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      return d[i].promise.finally(() => {
        inFlight -= 1;
      });
    });
    await Promise.resolve();
    // Two workers start, the third waits.
    expect(peak).toBe(2);
    d[0].resolve(10);
    await Promise.resolve();
    d[1].resolve(20);
    d[2].resolve(30);
    await expect(running).resolves.toEqual([10, 20, 30]);
    expect(peak).toBe(2);
  });

  it("handles an empty input", async () => {
    await expect(mapWithConcurrency([], 4, async () => 1)).resolves.toEqual([]);
  });

  it("handles a limit larger than the input", async () => {
    await expect(mapWithConcurrency([1], 10, async (n) => n + 1)).resolves.toEqual([2]);
  });
});

describe("withTimeout", () => {
  it("resolves with the value when the promise settles in time", async () => {
    await expect(withTimeout(Promise.resolve(7), 1000)).resolves.toBe(7);
  });

  it("rejects once the timeout elapses", async () => {
    const never = new Promise<number>(() => {});
    await expect(withTimeout(never, 10)).rejects.toThrow(/Timed out after 10ms/);
  });

  it("propagates a rejection from the underlying promise", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 1000)).rejects.toThrow("boom");
  });
});
