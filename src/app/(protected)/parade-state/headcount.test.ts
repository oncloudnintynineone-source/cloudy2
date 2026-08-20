import { describe, expect, it } from "vitest";

import { departmentHeadcount } from "./headcount";

describe("departmentHeadcount", () => {
  it("counts everyone as present when no user has events", () => {
    const users = [{ id: "u1" }, { id: "u2" }, { id: "u3" }];
    expect(departmentHeadcount(users, new Map())).toEqual({ total: 3, present: 3 });
  });

  it("excludes users with at least one out-of-camp event", () => {
    const users = [{ id: "u1" }, { id: "u2" }, { id: "u3" }];
    const eventsByUser = new Map([
      ["u2", [{ id: "e1" }]],
      ["u3", [{ id: "e2" }]],
    ]);
    expect(departmentHeadcount(users, eventsByUser)).toEqual({ total: 3, present: 1 });
  });

  it("counts a user once even with multiple out-of-camp events", () => {
    const users = [{ id: "u1" }];
    const eventsByUser = new Map([["u1", [{ id: "e1" }, { id: "e2" }]]]);
    expect(departmentHeadcount(users, eventsByUser)).toEqual({ total: 1, present: 0 });
  });

  it("handles an empty department", () => {
    expect(departmentHeadcount([], new Map())).toEqual({ total: 0, present: 0 });
  });
});