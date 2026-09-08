import { describe, expect, it } from "vitest";

import {
  DEFAULT_TITLE_RECIPE,
  renderTitleRecipe,
  sanitizeTitleRecipe,
  validateTitleRecipe,
  type EventTitleRecipeInput,
  type TitleRecipe,
} from "./titleRecipe";

const input: EventTitleRecipeInput = {
  description: "Team offsite",
  eventType: { name: "Training", acronym: "TRN" },
  people: [
    { full: "John Lai", acronym: "JL", fqn: "John Lai: DEPT-Engineering 1" },
    { full: "Mei Lin", acronym: "ML", fqn: "Mei Lin: DEPT-Logistics" },
  ],
  departments: ["Engineering 1", "Logistics"],
  location: "Hall A",
  timeOption: "range",
  startTime: "09:00",
  endTime: "17:00",
  startAmPm: "",
  endAmPm: "",
};

const recipe = (segments: TitleRecipe["segments"]): TitleRecipe => ({ segments });

describe("renderTitleRecipe", () => {
  it("renders the default recipe as the raw description", () => {
    expect(renderTitleRecipe(input, DEFAULT_TITLE_RECIPE)).toBe("Team offsite");
  });

  it("renders type + description with a space connector", () => {
    expect(
      renderTitleRecipe(
        input,
        recipe([
          { field: "type", typeStyle: "acronym", connector: "space" },
          { field: "description" },
        ]),
      ),
    ).toBe("TRN Team offsite");
  });

  it("renders wrapped time/people decorations", () => {
    expect(
      renderTitleRecipe(
        input,
        recipe([
          { field: "description", connector: "comma" },
          { field: "people", peopleStyle: "acronym", wrapper: "paren", connector: "space" },
          { field: "time", wrapper: "paren" },
        ]),
      ),
    ).toBe("Team offsite, (JL, ML) (09:00-17:00)");
  });

  it("never leaves a leading or trailing connector", () => {
    // Description is the only empty field in the middle — the location connector
    // attaches to the following segment, which stays; nothing dangles.
    const rendered = renderTitleRecipe(
      { ...input, description: "" },
      recipe([
        { field: "type", typeStyle: "acronym", connector: "colon" },
        { field: "description", connector: "comma" },
        { field: "location", connector: "comma" },
      ]),
    );
    expect(rendered).toBe("TRN: Hall A");
  });

  it("drops a segment when its field is empty (wrapper too)", () => {
    expect(
      renderTitleRecipe(
        { ...input, location: "" },
        recipe([
          { field: "description", connector: "comma" },
          { field: "location", wrapper: "paren", connector: "space" },
        ]),
      ),
    ).toBe("Team offsite");
  });

  it("drops empty people/departments lists", () => {
    expect(
      renderTitleRecipe(
        { ...input, people: [], departments: [] },
        recipe([{ field: "people", peopleStyle: "acronym" }, { field: "departments" }]),
      ),
    ).toBe("");
  });

  it("renders people fqn by default and name/acronym styles explicitly", () => {
    expect(renderTitleRecipe(input, recipe([{ field: "people" }]))).toBe(
      "John Lai: DEPT-Engineering 1, Mei Lin: DEPT-Logistics",
    );
    expect(renderTitleRecipe(input, recipe([{ field: "people", peopleStyle: "full" }]))).toBe(
      "John Lai, Mei Lin",
    );
    expect(renderTitleRecipe(input, recipe([{ field: "people", peopleStyle: "acronym" }]))).toBe(
      "JL, ML",
    );
  });

  it("renders type name vs acronym styles", () => {
    expect(renderTitleRecipe(input, recipe([{ field: "type" }]))).toBe("Training");
    expect(renderTitleRecipe(input, recipe([{ field: "type", typeStyle: "acronym" }]))).toBe("TRN");
  });

  it("renders half-day AM marker only via a time segment", () => {
    expect(
      renderTitleRecipe(
        {
          ...input,
          description: "Duty",
          timeOption: "half",
          startAmPm: "AM",
          endAmPm: "PM",
          startTime: "",
          endTime: "",
        },
        recipe([{ field: "description" }]),
      ),
    ).toBe("Duty");
    expect(
      renderTitleRecipe(
        {
          ...input,
          description: "Duty",
          timeOption: "half",
          startAmPm: "AM",
          endAmPm: "PM",
          startTime: "",
          endTime: "",
        },
        recipe([
          { field: "description", connector: "space" },
          { field: "time" },
        ]),
      ),
    ).toBe("Duty AM");
  });

  it("trims surrounding whitespace in the result", () => {
    expect(renderTitleRecipe({ ...input, description: "  Team offsite  " }, DEFAULT_TITLE_RECIPE)).toBe(
      "Team offsite",
    );
  });

  it("renders literal text segments verbatim and joins them", () => {
    expect(
      renderTitleRecipe(
        input,
        recipe([
          { field: "text", text: "You're included in a new event", connector: "middot" },
          { field: "description", connector: "middot" },
          { field: "time", wrapper: "paren" },
        ]),
      ),
    ).toBe("You're included in a new event · Team offsite · (09:00-17:00)");
  });

  it("renders the full wall-clock string for a time segment when timeFull is set", () => {
    expect(
      renderTitleRecipe(
        { ...input, timeFull: "2026-08-21 14:00 – 15:30" },
        recipe([{ field: "time", wrapper: "paren" }]),
      ),
    ).toBe("(2026-08-21 14:00 – 15:30)");
  });

  it("skips a text segment whose text is blank", () => {
    expect(
      renderTitleRecipe(
        input,
        recipe([{ field: "text", text: "   " }, { field: "description", connector: "space" }]),
      ),
    ).toBe("Team offsite");
  });

  it("returns an empty string when every segment is empty", () => {
    expect(renderTitleRecipe({ ...input, description: "", people: [] }, recipe([{ field: "description" }, { field: "people" }]))).toBe("");
  });
});

describe("sanitizeTitleRecipe", () => {
  it("passes a valid recipe through", () => {
    const good: TitleRecipe = { segments: [{ field: "type", typeStyle: "acronym" }] };
    expect(sanitizeTitleRecipe(good)).toEqual(good);
  });

  it("drops unknown segments and falls back to the default when nothing remains", () => {
    expect(sanitizeTitleRecipe({ segments: [{ field: "bogus" }] })).toEqual(DEFAULT_TITLE_RECIPE);
    expect(sanitizeTitleRecipe({ segments: [] })).toEqual(DEFAULT_TITLE_RECIPE);
    expect(sanitizeTitleRecipe(null)).toEqual(DEFAULT_TITLE_RECIPE);
    expect(sanitizeTitleRecipe("nonsense")).toEqual(DEFAULT_TITLE_RECIPE);
  });

  it("keeps only recognized decorations", () => {
    const result = sanitizeTitleRecipe({
      segments: [
        {
          field: "type",
          typeStyle: "acronym",
          peopleStyle: "full",
          wrapper: "weird",
          connector: "comma",
        },
      ],
    });
    expect(result.segments[0]).toEqual({ field: "type", typeStyle: "acronym", connector: "comma" });
  });

  it("keeps text only on text segments (trimmed)", () => {
    const result = sanitizeTitleRecipe({
      segments: [
        { field: "text", text: "  Hello world  " },
        { field: "type", text: "ignored" },
      ],
    });
    expect(result.segments[0].text).toBe("Hello world");
    expect(result.segments[1].text).toBeUndefined();
  });

  it("caps the segment count", () => {
    const many = { segments: Array.from({ length: 30 }, () => ({ field: "description" as const })) };
    expect(sanitizeTitleRecipe(many).segments.length).toBeLessThanOrEqual(12);
  });
});

describe("validateTitleRecipe", () => {
  it("accepts a complete recipe", () => {
    expect(validateTitleRecipe({ segments: [{ field: "type" }, { field: "description" }] })).toEqual({});
  });

  it("rejects an empty segment list", () => {
    expect(validateTitleRecipe({ segments: [] }).recipe).toBe("Add at least one field");
  });

  it("rejects unknown fields/decorations", () => {
    expect(
      (
        validateTitleRecipe({
          segments: [{ field: "type", typeStyle: "acronym", wrapper: "bogus" }],
        } as unknown as TitleRecipe).recipe
      ),
    ).toBe("Recipe contains an unknown value");
  });

  it("rejects too many segments", () => {
    const segments = Array.from({ length: 13 }, () => ({ field: "description" as const }));
    expect(validateTitleRecipe({ segments }).recipe).toContain("12");
  });
});
