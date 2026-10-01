import { describe, expect, it } from "vitest";

import {
  paradeEmailDate,
  paradeEmailNow,
  paradeEmailWindowOpen,
  parseSendTime,
  type ParadeEmailWindowInput,
} from "./schedule";

// UTC+8 fixed: 2026-09-14 is a Monday, 2026-09-19 a Saturday.
const MONDAY_0900 = new Date("2026-09-14T01:00:00Z"); // 09:00 UTC+8
const MONDAY_0759 = new Date("2026-09-13T23:59:00Z"); // 07:59 UTC+8
const SATURDAY_0900 = new Date("2026-09-19T01:00:00Z"); // 09:00 UTC+8

const base: ParadeEmailWindowInput = {
  enabled: true,
  recipientCount: 2,
  now: MONDAY_0900,
  sendTime: "08:00",
  days: [1, 2, 3, 4, 5],
};

describe("paradeEmailNow", () => {
  it("reads the UTC+8 date, ISO weekday, and minutes across a UTC boundary", () => {
    expect(paradeEmailNow(new Date("2026-09-13T23:00:00Z"))).toEqual({
      date: "2026-09-14",
      weekday: 1,
      minutes: 7 * 60,
    });
  });
});

describe("paradeEmailDate", () => {
  it("resolves the UTC+8 calendar date across a UTC boundary", () => {
    expect(paradeEmailDate(new Date("2026-09-12T23:00:00Z"))).toBe("2026-09-13");
  });
});

describe("parseSendTime", () => {
  it("parses HH:mm to minutes since midnight", () => {
    expect(parseSendTime("08:00")).toBe(480);
    expect(parseSendTime("8:05")).toBe(485);
    expect(parseSendTime("23:59")).toBe(1439);
  });

  it("falls back to 08:00 for malformed or out-of-range values", () => {
    expect(parseSendTime("nonsense")).toBe(480);
    expect(parseSendTime("24:00")).toBe(480);
    expect(parseSendTime("08:60")).toBe(480);
  });
});

describe("paradeEmailWindowOpen", () => {
  it("is open on a send day at/after the cutoff with recipients", () => {
    expect(paradeEmailWindowOpen(base)).toEqual({ open: true });
  });

  it("is closed before the cutoff", () => {
    expect(paradeEmailWindowOpen({ ...base, now: MONDAY_0759 })).toEqual({
      open: false,
      reason: "before-time",
    });
  });

  it("is closed on a day not in the configured set", () => {
    expect(paradeEmailWindowOpen({ ...base, now: SATURDAY_0900 })).toEqual({
      open: false,
      reason: "not-a-send-day",
    });
  });

  it("is closed when disabled", () => {
    expect(paradeEmailWindowOpen({ ...base, enabled: false })).toEqual({
      open: false,
      reason: "disabled",
    });
  });

  it("is closed without configured recipients", () => {
    expect(paradeEmailWindowOpen({ ...base, recipientCount: 0 })).toEqual({
      open: false,
      reason: "no-recipients",
    });
  });
});
