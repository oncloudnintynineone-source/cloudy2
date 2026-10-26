import { describe, expect, it } from "vitest";

import { tabWarmKinds } from "./warmup";

describe("tabWarmKinds", () => {
  it("deduplicates kinds in first-seen strip order", () => {
    expect(
      tabWarmKinds([
        { kind: "month" },
        { kind: "agenda" },
        { kind: "month" },
        { kind: "dual" },
        { kind: "agenda" },
      ]),
    ).toEqual(["month", "agenda", "dual"]);
  });

  it("returns an empty list when there are no tabs", () => {
    expect(tabWarmKinds([])).toEqual([]);
  });
});
