import { describe, expect, it } from "vitest";

import { isUuid, onlyUuidIds, uniqueUuidIds } from "./uuid";

describe("isUuid", () => {
  it("accepts canonical uuids", () => {
    expect(isUuid("9b76de2c-9b63-4a1b-89e1-ccc3aa9bf445")).toBe(true);
    expect(isUuid("6634eddc-aeca-4672-b0f3-ce0726f97e27")).toBe(true);
    expect(isUuid("9B76DE2C-9B63-4A1B-89E1-CCC3AA9BF445")).toBe(true);
  });

  it("rejects non-uuid ids", () => {
    expect(isUuid("admin")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid("9b76de2c-9b63-4a1b-89e1")).toBe(false);
    expect(isUuid("not-a-uuid-at-all")).toBe(false);
  });
});

describe("onlyUuidIds", () => {
  it("keeps uuids and drops everything else", () => {
    const uuid = "9b76de2c-9b63-4a1b-89e1-ccc3aa9bf445";
    expect(onlyUuidIds(["admin", uuid, ""])).toEqual([uuid]);
  });

  it("returns an empty array when no uuids remain", () => {
    expect(onlyUuidIds(["admin"])).toEqual([]);
  });
});

describe("uniqueUuidIds", () => {
  it("keeps the first appearance order and removes duplicates", () => {
    const a = "9b76de2c-9b63-4a1b-89e1-ccc3aa9bf445";
    const b = "6634eddc-aeca-4672-b0f3-ce0726f97e27";
    expect(uniqueUuidIds(["admin", a, b, a, ""])).toEqual([a, b]);
  });

  it("returns an empty array for no valid ids", () => {
    expect(uniqueUuidIds(["admin", "x"])).toEqual([]);
  });
});
