import { describe, expect, it } from "vitest";

import { formatWeekLabel } from "./clientDateTime";

describe("formatWeekLabel", () => {
  it("omits the year for a week fully inside one month", () => {
    // Mon 2026-08-17 .. Sun 2026-08-23
    expect(formatWeekLabel("2026-08-17", "2026-08-23")).toBe("Aug 17 – 23, 2026");
  });

  it("adds the year once when the week crosses a month boundary", () => {
    // Mon 2026-06-29 .. Sun 2026-07-05
    expect(formatWeekLabel("2026-06-29", "2026-07-05")).toBe("Jun 29 – Jul 5, 2026");
  });

  it("adds both years when the week crosses a year boundary", () => {
    // Mon 2025-12-29 .. Sun 2026-01-04
    expect(formatWeekLabel("2025-12-29", "2026-01-04")).toBe("Dec 29, 2025 – Jan 4, 2026");
  });
});
