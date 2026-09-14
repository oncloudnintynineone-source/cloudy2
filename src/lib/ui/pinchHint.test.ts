import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PINCH_HINT_STORAGE_KEY,
  getPinchHintServerSnapshot,
  getPinchHintSnapshot,
  markPinchHintSeen,
  subscribePinchHint,
} from "./pinchHint";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PINCH_HINT_STORAGE_KEY", () => {
  it("is scoped to the app", () => {
    expect(PINCH_HINT_STORAGE_KEY).toBe("cloudy2.pinch-hint");
  });
});

describe("pinchHint snapshots", () => {
  it("is unseen outside the browser", () => {
    expect(getPinchHintSnapshot()).toBe(false);
    expect(getPinchHintServerSnapshot()).toBe(false);
  });

  it("reads the session flag once set", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
      },
    });
    expect(getPinchHintSnapshot()).toBe(false);
    markPinchHintSeen();
    expect(getPinchHintSnapshot()).toBe(true);
  });

  it("notifies subscribers on write and stops after unsubscribe", () => {
    vi.stubGlobal("window", {
      sessionStorage: { getItem: () => null, setItem: () => undefined },
    });
    const listener = vi.fn();
    const unsubscribe = subscribePinchHint(listener);
    markPinchHintSeen();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    markPinchHintSeen();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("treats blocked storage as unseen and never throws", () => {
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(getPinchHintSnapshot()).toBe(false);
    expect(() => markPinchHintSeen()).not.toThrow();
  });
});
