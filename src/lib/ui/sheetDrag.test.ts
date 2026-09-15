import { describe, expect, it } from "vitest";

import { sheetDragOffset, shouldDismissSheet } from "./sheetDrag";

describe("sheetDragOffset", () => {
  it("passes downward movement through", () => {
    expect(sheetDragOffset(120)).toBe(120);
  });

  it("clamps upward movement to zero", () => {
    expect(sheetDragOffset(-40)).toBe(0);
    expect(sheetDragOffset(0)).toBe(0);
  });
});

describe("shouldDismissSheet", () => {
  it("ignores non-downward releases", () => {
    expect(shouldDismissSheet({ movementY: 0, velocityY: 0, height: 600 })).toBe(false);
    expect(shouldDismissSheet({ movementY: -200, velocityY: -1, height: 600 })).toBe(false);
  });

  it("dismisses on a fast downward flick regardless of travel", () => {
    expect(shouldDismissSheet({ movementY: 20, velocityY: 0.8, height: 600 })).toBe(true);
  });

  it("dismisses past the absolute floor for a short sheet", () => {
    expect(shouldDismissSheet({ movementY: 81, velocityY: 0, height: 100 })).toBe(true);
  });

  it("requires a share of the height for a tall sheet", () => {
    expect(shouldDismissSheet({ movementY: 100, velocityY: 0, height: 800 })).toBe(false);
    expect(shouldDismissSheet({ movementY: 201, velocityY: 0, height: 800 })).toBe(true);
  });

  it("springs back below the threshold", () => {
    expect(shouldDismissSheet({ movementY: 60, velocityY: 0.2, height: 600 })).toBe(false);
  });
});
