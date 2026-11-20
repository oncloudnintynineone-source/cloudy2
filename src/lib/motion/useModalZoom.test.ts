import { describe, expect, it } from "vitest";

import { MODAL_SIZE_PX, resolveModalSize } from "./useModalZoom";

const spec = { narrow: "xs" as const, mobile: "sm" as const, desktop: "lg" as const };

describe("resolveModalSize", () => {
  it("uses the narrow tier first", () => {
    expect(resolveModalSize(spec, { isNarrow: true, isDesktop: true })).toBe("xs");
  });

  it("falls back to the mobile tier when no narrow tier is given", () => {
    expect(
      resolveModalSize({ mobile: "md", desktop: "lg" }, { isNarrow: true, isDesktop: false }),
    ).toBe("md");
  });

  it("uses desktop and mobile tiers otherwise", () => {
    expect(resolveModalSize(spec, { isNarrow: false, isDesktop: true })).toBe("lg");
    expect(resolveModalSize(spec, { isNarrow: false, isDesktop: false })).toBe("sm");
  });
});

describe("MODAL_SIZE_PX", () => {
  it("matches Mantine's documented modal widths", () => {
    expect(MODAL_SIZE_PX.xs).toBe(320);
    expect(MODAL_SIZE_PX.sm).toBe(380);
    expect(MODAL_SIZE_PX.md).toBe(440);
    expect(MODAL_SIZE_PX.lg).toBe(620);
    expect(MODAL_SIZE_PX.xl).toBe(780);
  });
});
