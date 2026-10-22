import { describe, expect, it } from "vitest";

import {
  CLUSTER_GAP,
  CONTROL_BUTTON_SIZE,
  DIVIDER_HEIGHT,
  SINGLE_AXIS_CLUSTER_HEIGHT,
  TWO_AXIS_ARROW_CENTER_FROM_TOP,
  TWO_AXIS_CLUSTER_HEIGHT,
  singleAxisCluster,
  twoAxisCluster,
} from "./gridNavGeometry";

const PAIR_HEIGHT = CONTROL_BUTTON_SIZE * 2 + CLUSTER_GAP;

describe("cluster heights", () => {
  it("reserve the pan-arrow slot in both shapes", () => {
    expect(SINGLE_AXIS_CLUSTER_HEIGHT).toBe(145);
    expect(TWO_AXIS_CLUSTER_HEIGHT).toBe(250);
    expect(TWO_AXIS_ARROW_CENTER_FROM_TOP).toBe(125);
  });
});

describe("singleAxisCluster", () => {
  const slice = { visibleTop: 100, visibleBottom: 600, center: 350 };

  it("centers the whole cluster on the slice center", () => {
    const layout = singleAxisCluster(slice, true);
    expect(layout.height).toBe(SINGLE_AXIS_CLUSTER_HEIGHT);
    expect(layout.top).toBe(350 - SINGLE_AXIS_CLUSTER_HEIGHT / 2);
  });

  it("never moves the zoom pair when the pan arrow appears or disappears", () => {
    for (const s of [
      { visibleTop: 100, visibleBottom: 600, center: 350 },
      { visibleTop: 0, visibleBottom: 145, center: 72.5 },
      { visibleTop: 40, visibleBottom: 120, center: 110 },
      { visibleTop: 0, visibleBottom: 900, center: 880 },
    ]) {
      expect(singleAxisCluster(s, true)).toEqual(singleAxisCluster(s, false));
    }
  });

  it("clamps so the cluster never bleeds past the slice bottom", () => {
    const layout = singleAxisCluster({ visibleTop: 100, visibleBottom: 400, center: 380 }, true);
    expect(layout.top).toBe(400 - SINGLE_AXIS_CLUSTER_HEIGHT);
  });

  it("keeps the zoom pair inside the slice when the slice is shorter than the cluster", () => {
    const layout = singleAxisCluster({ visibleTop: 100, visibleBottom: 200, center: 150 }, false);
    expect(layout.top).toBe(150 - PAIR_HEIGHT / 2);
    expect(layout.top + PAIR_HEIGHT).toBeLessThanOrEqual(200);
  });

  it("pins the pair to the slice top on a strip shorter than the pair itself", () => {
    const layout = singleAxisCluster({ visibleTop: 100, visibleBottom: 140, center: 120 }, true);
    expect(layout.top).toBe(100);
  });
});

describe("twoAxisCluster", () => {
  const slice = { visibleTop: 100, visibleBottom: 800, center: 450 };

  it("anchors the reserved arrow slot on the slice center", () => {
    const layout = twoAxisCluster(slice, true);
    expect(layout.height).toBe(TWO_AXIS_CLUSTER_HEIGHT);
    expect(layout.top + TWO_AXIS_ARROW_CENTER_FROM_TOP).toBe(450);
  });

  it("holds the zoom pairs still as the pan arrow toggles", () => {
    expect(twoAxisCluster(slice, true)).toEqual(twoAxisCluster(slice, false));
  });

  it("clamps the full cluster inside a slice tall enough to hold it", () => {
    const layout = twoAxisCluster({ visibleTop: 100, visibleBottom: 400, center: 390 }, false);
    expect(layout.top).toBe(400 - TWO_AXIS_CLUSTER_HEIGHT);
  });

  it("falls back to centering the zoom pair on a too-short slice", () => {
    const layout = twoAxisCluster({ visibleTop: 100, visibleBottom: 200, center: 150 }, true);
    expect(layout.top).toBe(150 - PAIR_HEIGHT / 2);
  });
});

describe("divider and gap constants", () => {
  it("are the values the component renders", () => {
    expect(CONTROL_BUTTON_SIZE).toBe(40);
    expect(CLUSTER_GAP).toBe(8);
    expect(DIVIDER_HEIGHT).toBe(1);
  });
});
