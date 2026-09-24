import { describe, expect, it } from "vitest";

import type { RosterUser } from "@/lib/roster/queries";
import { filterContacts, NO_DEPARTMENT_FILTER } from "./filter";

function user(
  overrides: Partial<RosterUser> & Pick<RosterUser, "id" | "name" | "phone">,
): RosterUser {
  return {
    shortname: null,
    email: null,
    birthday: null,
    role: "user",
    status: "active",
    department: null,
    ...overrides,
  };
}

const ALICE = user({
  id: "a",
  name: "Alice Tan",
  shortname: "AT",
  phone: "81234567",
  department: { id: "dept-eng", name: "Engineering", sortOrder: 1 },
});
const BOB = user({
  id: "b",
  name: "Bob Lim",
  shortname: "BL",
  phone: "82345678",
  department: { id: "dept-log", name: "Logistics", sortOrder: 2 },
});
const CARA = user({ id: "c", name: "Cara Ng", phone: "83456789" });

const ROSTER = [ALICE, BOB, CARA];

describe("filterContacts", () => {
  it("returns every contact when no query or department filter is set", () => {
    expect(filterContacts(ROSTER, "", [])).toEqual(ROSTER);
  });

  it("matches the free-text query against name, shortname, and phone", () => {
    expect(filterContacts(ROSTER, "alice", []).map((u) => u.id)).toEqual(["a"]);
    expect(filterContacts(ROSTER, "at", []).map((u) => u.id)).toEqual(["a"]);
    expect(filterContacts(ROSTER, "83456789", []).map((u) => u.id)).toEqual(["c"]);
  });

  it("fuzzy-matches name typos without cross-matching similar phone numbers", () => {
    expect(filterContacts(ROSTER, "alise", []).map((u) => u.id)).toEqual(["a"]);
    expect(filterContacts(ROSTER, "83456789", []).map((u) => u.id)).toEqual(["c"]);
  });

  it("filters by the selected departments", () => {
    expect(filterContacts(ROSTER, "", ["dept-log"]).map((u) => u.id)).toEqual(["b"]);
  });

  it("treats an empty department list as no department filter", () => {
    expect(filterContacts(ROSTER, "", []).map((u) => u.id)).toEqual(["a", "b", "c"]);
  });

  it("matches department-less users via the sentinel", () => {
    expect(filterContacts(ROSTER, "", [NO_DEPARTMENT_FILTER]).map((u) => u.id)).toEqual(["c"]);
  });

  it("ANDs the search query with the department selection", () => {
    expect(filterContacts(ROSTER, "bob", ["dept-eng"])).toEqual([]);
    expect(filterContacts(ROSTER, "bob", ["dept-log"]).map((u) => u.id)).toEqual(["b"]);
  });
});
