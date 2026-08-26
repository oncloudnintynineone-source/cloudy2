import { describe, expect, it } from "vitest";

import { WEBHOOK_ACTIONS } from "./payload";
import { buildExampleWebhookPayload } from "./example";

describe("buildExampleWebhookPayload", () => {
  it("is deterministic for a fixed action", () => {
    expect(buildExampleWebhookPayload(WEBHOOK_ACTIONS.eventCreated)).toBe(
      buildExampleWebhookPayload(WEBHOOK_ACTIONS.eventCreated),
    );
  });

  it("produces distinct examples per action", () => {
    const created = buildExampleWebhookPayload(WEBHOOK_ACTIONS.eventCreated);
    const updated = buildExampleWebhookPayload(WEBHOOK_ACTIONS.eventUpdated);
    const deleted = buildExampleWebhookPayload(WEBHOOK_ACTIONS.eventDeleted);
    expect(created).not.toBe(updated);
    expect(updated).not.toBe(deleted);
  });

  it("renders valid JSON whose action matches the request", () => {
    for (const action of Object.values(WEBHOOK_ACTIONS)) {
      const payload = JSON.parse(buildExampleWebhookPayload(action));
      expect(payload.action).toBe(action);
      expect(payload.event.title).toBe("Range Alpha");
      expect(payload.actor.name).toBe("Alice Tan");
    }
  });

  it("includes changes only on the update example", () => {
    const created = JSON.parse(buildExampleWebhookPayload(WEBHOOK_ACTIONS.eventCreated));
    const updated = JSON.parse(buildExampleWebhookPayload(WEBHOOK_ACTIONS.eventUpdated));
    const deleted = JSON.parse(buildExampleWebhookPayload(WEBHOOK_ACTIONS.eventDeleted));
    expect("changes" in created).toBe(false);
    expect(updated.changes.location).toEqual(["Range North", "Range South"]);
    expect("changes" in deleted).toBe(false);
  });

  it("omits structured time keys on the delete example (legacy event)", () => {
    const deleted = JSON.parse(buildExampleWebhookPayload(WEBHOOK_ACTIONS.eventDeleted));
    expect(deleted.event.timeOption).toBeUndefined();
    expect(deleted.event.start).toBeUndefined();
    // The pre-formatted display time remains as fallback.
    expect(deleted.event.time).toContain("2026-08-21");
    const created = JSON.parse(buildExampleWebhookPayload(WEBHOOK_ACTIONS.eventCreated));
    expect(created.event.timeOption).toBe("half");
    expect(created.event.startAmPm).toBe("AM");
  });
});
