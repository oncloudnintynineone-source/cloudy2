import { describe, expect, it } from "vitest";

import { capBadgeItems } from "@/lib/ui/badgeCap";

const items = ["a", "b", "c", "d", "e", "f", "g"];
const isSelf = (value: string) => value === "f";

describe("capBadgeItems", () => {
  it("is a no-op slice when everything fits", () => {
    expect(capBadgeItems(["a", "b"], 5)).toEqual({ visible: ["a", "b"], overflow: 0 });
    expect(capBadgeItems(items, 7)).toEqual({ visible: items, overflow: 0 });
  });

  it("caps to the prefix and counts the overflow", () => {
    expect(capBadgeItems(items, 5)).toEqual({ visible: ["a", "b", "c", "d", "e"], overflow: 2 });
  });

  it("pins the self item first when it falls outside the cap", () => {
    const result = capBadgeItems(items, 5, isSelf);
    expect(result.visible).toEqual(["f", "a", "b", "c", "d"]);
    expect(result.overflow).toBe(2);
  });

  it("keeps authored order when the self item already fits", () => {
    const near = (value: string) => value === "b";
    expect(capBadgeItems(items, 5, near).visible).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("keeps authored order when no item is self", () => {
    expect(capBadgeItems(items, 3, (value) => value === "z").visible).toEqual(["a", "b", "c"]);
  });

  it("renders nothing with a zero cap", () => {
    expect(capBadgeItems(items, 0, isSelf)).toEqual({ visible: [], overflow: 7 });
  });
});
