import { describe, expect, it } from "vitest";

import {
  KAH_EMAIL_BODY_TEMPLATE_DEFAULT,
  KAH_EMAIL_SUBJECT_TEMPLATE_DEFAULT,
} from "./emailDefaults";
import {
  buildKahBreachEmail,
  KAH_TEMPLATE_SAMPLE_CONTEXT,
  renderKahEmailTemplate,
  type KahBreachEmailGroup,
} from "./email";

const breach = (overrides: Partial<KahBreachEmailGroup> = {}): KahBreachEmailGroup => ({
  groupName: "Command",
  requiredPct: 60,
  actualPct: 40,
  totalMembers: 5,
  awayNames: ["Tan Wei Liang", "Lim Kah"],
  ...overrides,
});

const baseInput = {
  eventTitle: "Overseas course",
  actorName: "Siti Nurul",
  windowStart: new Date("2026-08-20T16:00:00Z"),
  windowEnd: new Date("2026-08-21T02:30:00Z"),
};

describe("renderKahEmailTemplate", () => {
  it("substitutes known tokens case-insensitively", () => {
    expect(
      renderKahEmailTemplate("{EVENT} by {actor}: {Window}", KAH_TEMPLATE_SAMPLE_CONTEXT),
    ).toBe("Overseas course by Siti Nurul: 2026-08-21 00:00:00 – 2026-08-23 18:30:00 (UTC+8)");
  });

  it("leaves unknown tokens as literal text", () => {
    expect(renderKahEmailTemplate("hi {nope} {breaches}", { ...KAH_TEMPLATE_SAMPLE_CONTEXT, breaches: "B" })).toBe(
      "hi {nope} B",
    );
  });

  it("renders the multi-line breaches block", () => {
    const rendered = renderKahEmailTemplate("{breaches}", KAH_TEMPLATE_SAMPLE_CONTEXT);
    expect(rendered.split("\n")).toHaveLength(2);
    expect(rendered).toContain("- Command: 40% in country (3 of 5 members, required 60%)");
  });
});

describe("buildKahBreachEmail", () => {
  it("returns null when there are no breaches", () => {
    expect(buildKahBreachEmail({ ...baseInput, breaches: [] })).toBeNull();
  });

  it("defaults to the built-in templates when none are given", () => {
    const email = buildKahBreachEmail({
      ...baseInput,
      breaches: [breach()],
    });
    // UTC+8 wall clock: 2026-08-20T16:00Z → 2026-08-21 00:00:00 local.
    expect(email?.subject).toBe("[cloudy2] KAH limit exceeded — Overseas course");
    expect(email?.body).toContain('After "Overseas course" was saved by Siti Nurul');
    expect(email?.body).toContain(
      "- Command: 40% in country (3 of 5 members, required 60%) — away: Tan Wei Liang, Lim Kah",
    );
    expect(email?.body).toContain("Event window: 2026-08-21 00:00:00 – 2026-08-21 10:30:00 (UTC+8)");
    expect(email?.body).toContain("This is a notification only");
  });

  it("uses admin templates verbatim with tokens substituted", () => {
    const email = buildKahBreachEmail({
      ...baseInput,
      breaches: [
        breach({
          groupName: "Ops",
          requiredPct: 100,
          actualPct: 50,
          totalMembers: 2,
          awayNames: [],
        }),
      ],
      subjectTemplate: "KAH alert: {event}",
      bodyTemplate: "Groups in trouble:\n{breaches}\n— {actor}",
    });
    expect(email?.subject).toBe("KAH alert: Overseas course");
    expect(email?.body).toContain(
      "- Ops: 50% in country (2 of 2 members, required 100%) — away: (names unavailable)",
    );
    expect(email?.body.endsWith("— Siti Nurul")).toBe(true);
  });

  it("falls back to defaults on blank templates and blank title/actor", () => {
    const email = buildKahBreachEmail({
      eventTitle: "   ",
      actorName: null,
      windowStart: new Date("2026-01-01T00:00:00Z"),
      windowEnd: new Date("2026-01-01T01:00:00Z"),
      breaches: [breach({ awayNames: [] })],
      subjectTemplate: "  ",
      bodyTemplate: "",
    });
    expect(email?.subject).toBe("[cloudy2] KAH limit exceeded — Untitled event");
    expect(email?.body).toContain("saved by a user");
  });

  it("keeps the shipped defaults in sync with the sample preview context", () => {
    // The Settings live preview renders the default templates against the
    // sample context; every default token must therefore exist in the context.
    for (const template of [KAH_EMAIL_SUBJECT_TEMPLATE_DEFAULT, KAH_EMAIL_BODY_TEMPLATE_DEFAULT]) {
      const unknown = [...template.matchAll(/\{([^{}]+)\}/g)]
        .map((match) => match[1].trim().toLowerCase())
        .filter((token) => !(token in KAH_TEMPLATE_SAMPLE_CONTEXT));
      expect(unknown).toEqual([]);
    }
  });
});
