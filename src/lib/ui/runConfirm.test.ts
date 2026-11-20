import { describe, expect, it } from "vitest";

import { runConfirm } from "./runConfirm";

describe("runConfirm", () => {
  it("calls onSuccess and returns true for an ok result", async () => {
    const calls: string[] = [];
    const ok = await runConfirm({
      call: async () => ({ ok: true }) as const,
      onSuccess: () => calls.push("success"),
      onError: () => calls.push("error"),
    });
    expect(ok).toBe(true);
    expect(calls).toEqual(["success"]);
  });

  it("calls onError with the message and returns false", async () => {
    const calls: string[] = [];
    const ok = await runConfirm({
      call: async () => ({ ok: false, error: "Nope" }) as const,
      onSuccess: () => calls.push("success"),
      onError: (message) => calls.push(message),
    });
    expect(ok).toBe(false);
    expect(calls).toEqual(["Nope"]);
  });
});
