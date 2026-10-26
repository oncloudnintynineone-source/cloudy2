import { describe, expect, it } from "vitest";

import { resolveShellViewportHeight } from "./viewport";

describe("resolveShellViewportHeight", () => {
  it("uses the visual viewport on iOS when available", () => {
    expect(resolveShellViewportHeight({ isIOS: true, layoutHeight: 900, visualHeight: 860 })).toBe(
      860,
    );
  });

  it("falls back to the layout viewport on iOS without a visual viewport", () => {
    expect(resolveShellViewportHeight({ isIOS: true, layoutHeight: 900 })).toBe(900);
  });

  it("keeps the layout viewport when Android's visual viewport shrinks (keyboard)", () => {
    expect(resolveShellViewportHeight({ isIOS: false, layoutHeight: 900, visualHeight: 540 })).toBe(
      900,
    );
  });

  it("uses the visual viewport when it is the only one that has updated", () => {
    expect(resolveShellViewportHeight({ isIOS: false, layoutHeight: 700, visualHeight: 900 })).toBe(
      900,
    );
  });

  it("uses the layout viewport when no visual viewport exists", () => {
    expect(resolveShellViewportHeight({ isIOS: false, layoutHeight: 900 })).toBe(900);
  });
});
