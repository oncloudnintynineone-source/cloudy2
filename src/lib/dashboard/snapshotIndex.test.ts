import { describe, expect, it } from "vitest";

import {
  SNAPSHOT_INDEX_VERSION,
  buildSnapshotIndexEntry,
  isSnapshotIndexUsable,
  pickColdPaintKey,
  type DashboardSnapshotIndex,
  type DashboardSnapshotRecord,
} from "./snapshot";

function record(input: {
  requestKey: string;
  savedAt: number;
  viewId: string;
  firstTabId: string;
  month: string;
  date: string;
}): DashboardSnapshotRecord {
  return {
    version: 1,
    savedAt: input.savedAt,
    context: {
      requestKey: input.requestKey,
      viewId: input.viewId,
      month: input.month,
      date: input.date,
    },
    data: {
      tabs: [{ id: input.firstTabId }],
      activeView: { id: input.viewId },
    },
  } as unknown as DashboardSnapshotRecord;
}

describe("buildSnapshotIndexEntry", () => {
  it("captures the cold-paint fields", () => {
    const entry = buildSnapshotIndexEntry(
      record({
        requestKey: "v1|2026-01",
        savedAt: 10,
        viewId: "v1",
        firstTabId: "v1",
        month: "2026-01",
        date: "2026-01-15",
      }),
    );
    expect(entry).toEqual({
      requestKey: "v1|2026-01",
      savedAt: 10,
      viewId: "v1",
      firstTabId: "v1",
      month: "2026-01",
      date: "2026-01-15",
    });
  });
});

describe("isSnapshotIndexUsable", () => {
  it("validates the index shape", () => {
    expect(isSnapshotIndexUsable({ v: SNAPSHOT_INDEX_VERSION, entries: [] })).toBe(true);
    expect(isSnapshotIndexUsable({ v: 0, entries: [] })).toBe(false);
    expect(isSnapshotIndexUsable({ v: SNAPSHOT_INDEX_VERSION, entries: [{}] })).toBe(false);
  });
});

describe("pickColdPaintKey", () => {
  const index: DashboardSnapshotIndex = {
    v: SNAPSHOT_INDEX_VERSION,
    entries: [
      {
        requestKey: "v1|2026-01",
        savedAt: 1,
        viewId: "v1",
        firstTabId: "v1",
        month: "2026-01",
        date: "2026-01-01",
      },
      {
        requestKey: "v1|2026-02",
        savedAt: 2,
        viewId: "v1",
        firstTabId: "v1",
        month: "2026-02",
        date: "2026-02-01",
      },
      {
        requestKey: "v2|2026-01",
        savedAt: 3,
        viewId: "v2",
        firstTabId: "v1",
        month: "2026-01",
        date: "2026-01-01",
      },
    ],
  };

  it("prefers the URL view and the named anchor month", () => {
    expect(
      pickColdPaintKey(index, {
        urlView: "v1",
        urlMonth: "2026-02",
        urlDate: null,
        rememberedMonth: "2026-01",
      }),
    ).toBe("v1|2026-02");
  });

  it("uses the newest first tab when the URL names no view", () => {
    expect(
      pickColdPaintKey(index, {
        urlView: null,
        urlMonth: "2026-01",
        urlDate: null,
        rememberedMonth: null,
      }),
    ).toBe("v2|2026-01");
  });

  it("falls back to the newest candidate when the anchor has no record", () => {
    expect(
      pickColdPaintKey(index, {
        urlView: "v1",
        urlMonth: "2026-03",
        urlDate: null,
        rememberedMonth: null,
      }),
    ).toBeNull();
  });
});
