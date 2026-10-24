import { describe, expect, it } from "vitest";

import { isColdLaunchActive, markColdLaunchSettled } from "@/lib/loading/coldLaunch";

describe("coldLaunch gate", () => {
  it("starts active on a fresh document load", () => {
    expect(isColdLaunchActive()).toBe(true);
  });

  it("deactivates once the cold-start tail settles", () => {
    markColdLaunchSettled();
    expect(isColdLaunchActive()).toBe(false);
  });

  it("stays deactivated for the rest of the session", () => {
    markColdLaunchSettled();
    expect(isColdLaunchActive()).toBe(false);
  });
});
