import { describe, expect, it } from "vitest";

import { effectiveFreeText, effectiveInviteeTags } from "./effectiveFields";

describe("effectiveInviteeTags", () => {
  const tags = ["dept:1", "user:a", "dept:2", "user:b"];

  it("passes the tags through on a normal type", () => {
    expect(
      effectiveInviteeTags({
        invitees: tags,
        registrationType: false,
        showInviteesStep: true,
        creatorId: "me",
      }),
    ).toEqual(tags);
  });

  it("drops department tags on registration events (person-only participants)", () => {
    expect(
      effectiveInviteeTags({
        invitees: tags,
        registrationType: true,
        showInviteesStep: true,
        creatorId: "me",
      }),
    ).toEqual(["user:a", "user:b"]);
  });

  it("collapses to the organizer when the type hides the Participants step", () => {
    expect(
      effectiveInviteeTags({
        invitees: tags,
        registrationType: false,
        showInviteesStep: false,
        creatorId: "me",
      }),
    ).toEqual(["user:me"]);
  });

  it("carries no attendee when a hidden-participants event has no organizer", () => {
    expect(
      effectiveInviteeTags({
        invitees: tags,
        registrationType: false,
        showInviteesStep: false,
        creatorId: "",
      }),
    ).toEqual([]);
  });

  it("keeps an empty roster empty on registration events", () => {
    expect(
      effectiveInviteeTags({
        invitees: [],
        registrationType: true,
        showInviteesStep: true,
        creatorId: "me",
      }),
    ).toEqual([]);
  });
});

describe("effectiveFreeText", () => {
  it("passes the text through when the Details step is shown", () => {
    expect(
      effectiveFreeText({ title: "Parade", remarks: "Wear whites.", showRemarksStep: true }),
    ).toEqual({ title: "Parade", remarks: "Wear whites." });
  });

  it("blanks both fields for a type with remarks disabled", () => {
    expect(
      effectiveFreeText({ title: "Parade", remarks: "Wear whites.", showRemarksStep: false }),
    ).toEqual({ title: "", remarks: "" });
  });
});
