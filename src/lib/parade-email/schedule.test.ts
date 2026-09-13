import { describe, expect, it } from "vitest";

import { normalizeSendTime, paradeEmailDate, paradeEmailDue } from "./schedule";

const base = {
  enabled: true,
  recipientCount: 2,
  sendTime: "07:00",
  alreadySentToday: false,
};

describe("normalizeSendTime", () => {
  it("accepts a valid 24-hour time", () => {
    expect(normalizeSendTime("07:00")).toBe("07:00");
    expect(normalizeSendTime(" 23:59 ")).toBe("23:59");
  });

  it("falls back to the default for blank or malformed values", () => {
    expect(normalizeSendTime("")).toBe("07:00");
    expect(normalizeSendTime(null)).toBe("07:00");
    expect(normalizeSendTime("7:00")).toBe("07:00");
    expect(normalizeSendTime("24:00")).toBe("07:00");
    expect(normalizeSendTime("07:60")).toBe("07:00");
  });
});

describe("paradeEmailDate", () => {
  it("resolves the UTC+8 calendar date across a UTC boundary", () => {
    // 2026-09-12T23:00:00Z is 2026-09-13 07:00 in UTC+8.
    expect(paradeEmailDate(new Date("2026-09-12T23:00:00Z"))).toBe("2026-09-13");
  });
});

describe("paradeEmailDue", () => {
  const atSgt = (iso: string) => new Date(iso);

  it("is due at or after the configured time", () => {
    const result = paradeEmailDue({ ...base, now: atSgt("2026-09-12T23:00:00Z") });
    expect(result).toMatchObject({ due: true, date: "2026-09-13", time: "07:00" });
  });

  it("is not due before the configured time", () => {
    const result = paradeEmailDue({ ...base, now: atSgt("2026-09-12T22:59:00Z") });
    expect(result).toMatchObject({ due: false, reason: "before-time", time: "06:59" });
  });

  it("is not due when already sent today", () => {
    const result = paradeEmailDue({
      ...base,
      alreadySentToday: true,
      now: atSgt("2026-09-12T23:30:00Z"),
    });
    expect(result).toMatchObject({ due: false, reason: "already-sent" });
  });

  it("is not due when disabled", () => {
    const result = paradeEmailDue({
      ...base,
      enabled: false,
      now: atSgt("2026-09-12T23:00:00Z"),
    });
    expect(result).toMatchObject({ due: false, reason: "disabled" });
  });

  it("is not due without recipients", () => {
    const result = paradeEmailDue({
      ...base,
      recipientCount: 0,
      now: atSgt("2026-09-12T23:00:00Z"),
    });
    expect(result).toMatchObject({ due: false, reason: "no-recipients" });
  });
});
