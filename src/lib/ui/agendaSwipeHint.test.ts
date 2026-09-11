import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AGENDA_SWIPE_HINT_STORAGE_KEY,
  getAgendaSwipeHintServerSnapshot,
  getAgendaSwipeHintSnapshot,
  markAgendaSwipeHintSeen,
  subscribeAgendaSwipeHint,
} from "./agendaSwipeHint";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AGENDA_SWIPE_HINT_STORAGE_KEY", () => {
  it("is scoped to the app", () => {
    expect(AGENDA_SWIPE_HINT_STORAGE_KEY).toBe("cloudy2.agenda-swipe-hint");
  });
});

describe("agendaSwipeHint snapshots", () => {
  it("is unseen outside the browser", () => {
    expect(getAgendaSwipeHintSnapshot()).toBe(false);
    expect(getAgendaSwipeHintServerSnapshot()).toBe(false);
  });

  it("reads the session flag once set", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
      },
    });
    expect(getAgendaSwipeHintSnapshot()).toBe(false);
    markAgendaSwipeHintSeen();
    expect(getAgendaSwipeHintSnapshot()).toBe(true);
  });

  it("notifies subscribers on write and stops after unsubscribe", () => {
    vi.stubGlobal("window", {
      sessionStorage: { getItem: () => null, setItem: () => undefined },
    });
    const listener = vi.fn();
    const unsubscribe = subscribeAgendaSwipeHint(listener);
    markAgendaSwipeHintSeen();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    markAgendaSwipeHintSeen();
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
    expect(getAgendaSwipeHintSnapshot()).toBe(false);
    expect(() => markAgendaSwipeHintSeen()).not.toThrow();
  });
});
