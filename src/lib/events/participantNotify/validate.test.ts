import { describe, expect, it } from "vitest";

import type { ParticipantNotifyTemplates } from "./templates";
import {
  PARTICIPANT_NOTIFY_BODY_TEMPLATE_MAX_LENGTH,
  PARTICIPANT_NOTIFY_TITLE_TEMPLATE_MAX_LENGTH,
  validateParticipantNotifyTemplates,
} from "./validate";

const valid: ParticipantNotifyTemplates = {
  createdTitle: "{title}",
  createdBody: "You're included in a new event< · {time}>< · {location}>",
  addedTitle: "{title}",
  addedBody: "You've been added to this event< · {time}>< · {location}>",
};

describe("validateParticipantNotifyTemplates", () => {
  it("accepts a complete template set", () => {
    expect(validateParticipantNotifyTemplates(valid)).toEqual({});
  });

  it("requires each field", () => {
    const errors = validateParticipantNotifyTemplates({
      ...valid,
      createdTitle: "  ",
      addedBody: "",
    });
    expect(errors.createdTitle).toBeTruthy();
    expect(errors.addedBody).toBeTruthy();
  });

  it("rejects multi-line templates (the OS collapses them)", () => {
    const errors = validateParticipantNotifyTemplates({
      ...valid,
      createdBody: "line one\nline two",
    });
    expect(errors.createdBody).toBe("Template must be a single line");
  });

  it("caps title and body lengths", () => {
    const errors = validateParticipantNotifyTemplates({
      ...valid,
      addedTitle: "x".repeat(PARTICIPANT_NOTIFY_TITLE_TEMPLATE_MAX_LENGTH + 1),
      addedBody: "x".repeat(PARTICIPANT_NOTIFY_BODY_TEMPLATE_MAX_LENGTH + 1),
    });
    expect(errors.addedTitle).toContain("140");
    expect(errors.addedBody).toContain("300");
  });
});
