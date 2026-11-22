import { describe, expect, it } from "vitest";

import { measureScrollEdges } from "@/lib/ui/scrollEdges";

describe("measureScrollEdges", () => {
  it("reports both extremes when the content fits (nothing is clipped)", () => {
    expect(measureScrollEdges(0, 300, 600)).toEqual({ atStart: true, atEnd: true });
    expect(measureScrollEdges(0, 600, 600)).toEqual({ atStart: true, atEnd: true });
  });

  it("reports only the start at the left extreme of a clipped scroller", () => {
    expect(measureScrollEdges(0, 1200, 600)).toEqual({ atStart: true, atEnd: false });
  });

  it("reports only the end at the right extreme", () => {
    expect(measureScrollEdges(600, 1200, 600)).toEqual({ atStart: false, atEnd: true });
  });

  it("reports neither extreme mid-scroll", () => {
    expect(measureScrollEdges(240, 1200, 600)).toEqual({ atStart: false, atEnd: false });
  });

  it("treats sub-pixel positions within the tolerance as reached", () => {
    expect(measureScrollEdges(0.5, 1200, 600).atStart).toBe(true);
    expect(measureScrollEdges(599.5, 1200, 600).atEnd).toBe(true);
  });
});
