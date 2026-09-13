import { describe, expect, it } from "vitest";

import { beginActivity, endActivity, isActivityBusy } from "./activity";

describe("activity refcount", () => {
  it("starts idle", () => {
    expect(isActivityBusy({})).toBe(false);
  });

  it("marks busy on the first begin", () => {
    const counts = beginActivity({}, "nav");
    expect(counts).toEqual({ nav: 1 });
    expect(isActivityBusy(counts)).toBe(true);
  });

  it("stacks overlapping begins for the same key", () => {
    const counts = endActivity(beginActivity(beginActivity({}, "nav"), "nav"), "nav");
    expect(counts).toEqual({ nav: 1 });
    expect(isActivityBusy(counts)).toBe(true);
  });

  it("clears a key when its last end arrives", () => {
    const counts = endActivity(beginActivity({}, "nav"), "nav");
    expect(counts).toEqual({});
    expect(isActivityBusy(counts)).toBe(false);
  });

  it("stays busy while another key is active", () => {
    let counts = beginActivity(beginActivity({}, "nav"), "refresh");
    counts = endActivity(counts, "nav");
    expect(isActivityBusy(counts)).toBe(true);
    counts = endActivity(counts, "refresh");
    expect(isActivityBusy(counts)).toBe(false);
  });

  it("ignores an end for an unknown key (double-release safe)", () => {
    const counts = endActivity({}, "nav");
    expect(counts).toEqual({});
  });

  it("never drives a count negative on a double-release", () => {
    let counts = endActivity(beginActivity({}, "nav"), "nav");
    counts = endActivity(counts, "nav");
    expect(counts).toEqual({});
  });

  it("does not mutate the input record", () => {
    const before = { nav: 1 };
    beginActivity(before, "nav");
    endActivity(before, "nav");
    expect(before).toEqual({ nav: 1 });
  });
});
