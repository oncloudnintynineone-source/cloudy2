import { describe, expect, it } from "vitest";

import { formatEventTitle, type EventTitleInput } from "./formatEventTitle";

const input: EventTitleInput = {
  description: "Team offsite",
  eventType: { name: "Training", acronym: "TRN" },
  people: [
    { full: "John Lai", acronym: "JL", fqn: "John Lai: DEPT-Engineering 1" },
    { full: "Mei Lin", acronym: "ML", fqn: "Mei Lin: DEPT-Logistics" },
  ],
  departments: ["Engineering 1", "Logistics"],
  location: "Hall A",
};

describe("formatEventTitle", () => {
  it("replaces {description}, {type} and {departments}", () => {
    expect(formatEventTitle(input, "{type} — {description} ({departments})")).toBe(
      "Training — Team offsite (Engineering 1, Logistics)",
    );
  });

  it("renders bare {people} as fully qualified names joined with ', '", () => {
    expect(formatEventTitle(input, "{description} @ {people}")).toBe(
      "Team offsite @ John Lai: DEPT-Engineering 1, Mei Lin: DEPT-Logistics",
    );
  });

  it("renders the {people:full}, {people:acronym} and {people:fqn} styles", () => {
    expect(formatEventTitle(input, "{people:full}")).toBe("John Lai, Mei Lin");
    expect(formatEventTitle(input, "{people:acronym}")).toBe("JL, ML");
    expect(formatEventTitle(input, "{people:fqn}")).toBe(
      "John Lai: DEPT-Engineering 1, Mei Lin: DEPT-Logistics",
    );
  });

  it("substitutes token names and styles case-insensitively", () => {
    expect(formatEventTitle(input, "{DESCRIPTION}")).toBe("Team offsite");
    expect(formatEventTitle(input, "{PEOPLE:ACRONYM}")).toBe("JL, ML");
    expect(formatEventTitle(input, "{Type}")).toBe("Training");
    expect(formatEventTitle(input, "{TYPE:ACRONYM}")).toBe("TRN");
  });

  it("renders {location}", () => {
    expect(formatEventTitle(input, "{type} — {description} @ {location}")).toBe(
      "Training — Team offsite @ Hall A",
    );
  });

  it("renders an empty location as an empty string (result is trimmed)", () => {
    expect(formatEventTitle({ ...input, location: "" }, "{description} @ {location}")).toBe(
      "Team offsite @",
    );
    // Middle-of-string gaps are not collapsed (matches other empty tokens).
    expect(
      formatEventTitle({ ...input, location: "" }, "{description} @ {location} · {type}"),
    ).toBe("Team offsite @  · Training");
    expect(formatEventTitle({ ...input, location: "" }, "  {location}  ")).toBe("");
  });

  it("renders {type} as the name and {type:acronym} as the shortname", () => {
    expect(formatEventTitle(input, "{type}")).toBe("Training");
    expect(formatEventTitle(input, "{type:acronym}")).toBe("TRN");
  });

  it("falls back to the name when the event type acronym is blank", () => {
    expect(
      formatEventTitle(
        { ...input, eventType: { name: "Training", acronym: "" } },
        "{type:acronym}",
      ),
    ).toBe("Training");
  });

  it("renders an absent event type as an empty string", () => {
    expect(formatEventTitle({ ...input, eventType: null }, "[{type}] {description}")).toBe(
      "[] Team offsite",
    );
  });

  it("leaves unknown event type styles as literal text", () => {
    expect(formatEventTitle(input, "{type:weird}")).toBe("{type:weird}");
  });

  it("renders empty people/departments lists as empty strings", () => {
    expect(formatEventTitle({ ...input, people: [] }, "{description} ({people})")).toBe(
      "Team offsite ()",
    );
    expect(formatEventTitle({ ...input, departments: [] }, "{description} - {departments}")).toBe(
      "Team offsite -",
    );
  });

  it("renders a single invitee without a separator", () => {
    expect(formatEventTitle({ ...input, people: [input.people[1]] }, "{people:acronym}")).toBe(
      "ML",
    );
  });

  it("leaves unknown people styles and unknown tokens as literal text", () => {
    expect(formatEventTitle(input, "{people:weird}")).toBe("{people:weird}");
    expect(formatEventTitle(input, "{description} [{nickname}]")).toBe("Team offsite [{nickname}]");
  });

  it("replaces repeated tokens everywhere", () => {
    expect(formatEventTitle(input, "{type}/{type}")).toBe("Training/Training");
  });

  it("trims surrounding whitespace in the result", () => {
    expect(formatEventTitle(input, "  {description}  ")).toBe("Team offsite");
  });

  it("renders an empty template as an empty string", () => {
    expect(formatEventTitle(input, "")).toBe("");
  });

  it("keeps literal text with no placeholders", () => {
    expect(formatEventTitle(input, "Staff meeting")).toBe("Staff meeting");
  });
});
