import { describe, expect, it } from "vitest";

import { openQueryReducer, type OpenQueryState } from "./useOpenQuery";

type State = OpenQueryState<{ value: number }>;

const idle: State = { status: "idle", data: null, error: null, requestId: 0 };

describe("openQueryReducer", () => {
  it("resets to loading with a new request id", () => {
    const next = openQueryReducer(idle, { type: "reset" });
    expect(next).toEqual({ status: "loading", data: null, error: null, requestId: 1 });
  });

  it("resets to idle when disabled", () => {
    expect(openQueryReducer(idle, { type: "reset", enabled: false }).status).toBe("idle");
  });

  it("accepts the latest success and drops a stale one", () => {
    const loading = openQueryReducer(idle, { type: "reset" });
    const ready = openQueryReducer(loading, {
      type: "success",
      requestId: loading.requestId,
      data: { value: 1 },
    });
    expect(ready.status).toBe("ready");
    expect(ready.data).toEqual({ value: 1 });

    const stale = openQueryReducer(ready, {
      type: "success",
      requestId: ready.requestId - 1,
      data: { value: 2 },
    });
    expect(stale).toBe(ready);
  });

  it("keeps the last data when a reload starts and when it fails", () => {
    const loading = openQueryReducer(idle, { type: "reset" });
    const ready = openQueryReducer(loading, {
      type: "success",
      requestId: loading.requestId,
      data: { value: 1 },
    });
    const reloading = openQueryReducer(ready, { type: "start", keepData: true });
    expect(reloading.data).toEqual({ value: 1 });
    const failed = openQueryReducer(reloading, {
      type: "error",
      requestId: reloading.requestId,
      error: "Nope",
    });
    expect(failed.status).toBe("error");
    expect(failed.error).toBe("Nope");
    expect(failed.data).toEqual({ value: 1 });
  });

  it("clears data on reset unless keepData is set", () => {
    const loading = openQueryReducer(idle, { type: "reset" });
    const ready = openQueryReducer(loading, {
      type: "success",
      requestId: loading.requestId,
      data: { value: 1 },
    });
    expect(openQueryReducer(ready, { type: "reset" }).data).toBeNull();
    expect(openQueryReducer(ready, { type: "reset", keepData: true }).data).toEqual({ value: 1 });
  });
});
