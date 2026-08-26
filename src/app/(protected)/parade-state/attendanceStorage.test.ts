import { describe, expect, it } from "vitest";

import {
  ATTENDANCE_STORAGE_KEY,
  parseAttendanceRecord,
  serializeAttendanceRecord,
} from "./attendanceStorage";

describe("parseAttendanceRecord", () => {
  it("returns an empty record for null", () => {
    expect(parseAttendanceRecord(null)).toEqual({});
  });

  it("returns an empty record for corrupt JSON", () => {
    expect(parseAttendanceRecord("{nope")).toEqual({});
  });

  it("returns an empty record for non-object JSON", () => {
    expect(parseAttendanceRecord("[]")).toEqual({});
    expect(parseAttendanceRecord("\"x\"")).toEqual({});
    expect(parseAttendanceRecord("5")).toEqual({});
    expect(parseAttendanceRecord("null")).toEqual({});
  });

  it("keeps only entries whose value is a string array", () => {
    const raw = JSON.stringify({
      "2026-08-23": ["u1", "u2"],
      "2026-08-24": [],
      notArray: "u1",
      notStrings: ["u1", 3],
    });
    expect(parseAttendanceRecord(raw)).toEqual({
      "2026-08-23": ["u1", "u2"],
      "2026-08-24": [],
    });
  });
});

describe("serializeAttendanceRecord", () => {
  it("round-trips through parse", () => {
    const record = { "2026-08-23": ["u1"], "2026-08-24": ["u2", "u3"] };
    expect(parseAttendanceRecord(serializeAttendanceRecord(record))).toEqual(record);
  });

  it("drops dates with no checked users", () => {
    expect(serializeAttendanceRecord({ "2026-08-23": [], "2026-08-24": ["u1"] })).toBe(
      JSON.stringify({ "2026-08-24": ["u1"] }),
    );
  });

  it("serializes an empty record to {}", () => {
    expect(serializeAttendanceRecord({})).toBe("{}");
  });
});

describe("ATTENDANCE_STORAGE_KEY", () => {
  it("is scoped to the app", () => {
    expect(ATTENDANCE_STORAGE_KEY).toBe("cloudy2.parade-attendance");
  });
});
