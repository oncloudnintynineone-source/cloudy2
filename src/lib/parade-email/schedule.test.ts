import { describe, expect, it } from "vitest";

import { paradeEmailDate, paradeEmailDue } from "./schedule";

const base = {
  enabled: true,
  recipientCount: 2,
  alreadySentToday: false,
};

describe("paradeEmailDate", () => {
  it("resolves the UTC+8 calendar date across a UTC boundary", () => {
    // 2026-09-12T23:00:00Z is 2026-09-13 07:00 in UTC+8.
    expect(paradeEmailDate(new Date("2026-09-12T23:00:00Z"))).toBe("2026-09-13");
  });
});

describe("paradeEmailDue", () => {
  it("is due when enabled, has recipients, and hasn't sent today", () => {
    expect(paradeEmailDue(base)).toEqual({ due: true });
  });

  it("is not due when already sent today", () => {
    expect(paradeEmailDue({ ...base, alreadySentToday: true })).toEqual({
      due: false,
      reason: "already-sent",
    });
  });

  it("is not due when disabled", () => {
    expect(paradeEmailDue({ ...base, enabled: false })).toEqual({
      due: false,
      reason: "disabled",
    });
  });

  it("is not due without recipients", () => {
    expect(paradeEmailDue({ ...base, recipientCount: 0 })).toEqual({
      due: false,
      reason: "no-recipients",
    });
  });
});
