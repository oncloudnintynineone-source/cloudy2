import { describe, expect, it } from "vitest";

import { readDashboardBootState, serializeDashboardBootPayload } from "./boot";

describe("serializeDashboardBootPayload", () => {
  it("round-trips the payload while escaping script-sensitive characters", () => {
    const payload = {
      userId: "user-1",
      view: "</script><script>alert(1)</script>",
      month: "2026-01",
      date: null,
      refresh: "1&2",
    };
    const serialized = serializeDashboardBootPayload(payload);
    expect(serialized).not.toContain("</script>");
    expect(serialized).not.toContain("<script>");
    expect(JSON.parse(serialized)).toEqual(payload);
  });
});

describe("readDashboardBootState", () => {
  it("rejects malformed state", () => {
    expect(readDashboardBootState(null)).toBeNull();
    expect(readDashboardBootState({ userId: "u" })).toBeNull();
    expect(
      readDashboardBootState({
        userId: "u",
        startedAt: 1,
        promise: Promise.resolve(null),
        abort: () => {},
      }),
    ).not.toBeNull();
  });
});
