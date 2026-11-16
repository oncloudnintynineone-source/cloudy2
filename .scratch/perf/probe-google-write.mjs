#!/usr/bin/env node
/**
 * Google Calendar WRITE latency probe (mutating, cleans up after itself).
 *
 * Creates three throwaway events on DEV department calendars at a far-future
 * date, serial vs concurrent, then deletes every one in a `finally`. Mirrors
 * the per-copy write loop in `createEvent` / the copy reconcile in
 * `updateEvent`.
 *
 * Usage: node .scratch/perf/probe-google-write.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { google } from "googleapis";
import postgres from "postgres";

const here = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(join(here, "..", "..", ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !(m[1] in process.env)) {
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}
const creds = process.env.GOOGLE_SERVICE_ACCOUNT_BASE64
  ? JSON.parse(Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8"))
  : {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    };
const auth = new google.auth.JWT({
  email: creds.client_email,
  key: creds.private_key,
  scopes: ["https://www.googleapis.com/auth/calendar"],
});
const calendar = google.calendar({ version: "v3", auth });

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const rows = await sql`select google_calendar_id from calendars limit 3`;
await sql.end({ timeout: 5 });
if (rows.length < 1) {
  console.error("No calendars in the DB");
  process.exit(1);
}
const gids = rows.map((r) => r.google_calendar_id);

const base = {
  summary: "cloudy2 responsiveness probe (safe to delete)",
  description: "Created by .scratch/perf/probe-google-write.mjs; deleted immediately.",
  start: { dateTime: "2030-01-02T09:00:00+08:00" },
  end: { dateTime: "2030-01-02T09:15:00+08:00" },
};

const created = [];
async function make(gid) {
  const res = await calendar.events.insert({ calendarId: gid, requestBody: base });
  created.push({ gid, id: res.data.id });
  return res;
}
async function cleanup() {
  for (const { gid, id } of created) {
    try {
      await calendar.events.delete({ calendarId: gid, eventId: id });
    } catch (error) {
      console.error(`cleanup failed for ${gid}/${id}:`, error.message);
    }
  }
}

async function timed(label, fn, runs = 3) {
  const samples = [];
  for (let i = 0; i < runs; i += 1) {
    const t0 = performance.now();
    await fn(i);
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  const p50 = samples[Math.floor(samples.length / 2)];
  console.log(`${label.padEnd(46)} p50 ${p50.toFixed(0).padStart(6)} ms  (n=${runs})`);
  return p50;
}

try {
  const serial = await timed("events.insert — 3 calendars serial", async () => {
    for (const gid of gids) await make(gid);
  });
  const concurrent = await timed("events.insert — 3 calendars concurrent", () =>
    Promise.all(gids.map((gid) => make(gid))),
  );
  console.log(`
insert one ~ ${(serial / gids.length).toFixed(0)} ms;
3 serial ${serial.toFixed(0)} ms vs 3 concurrent ${concurrent.toFixed(0)} ms
(save ~${(serial - concurrent).toFixed(0)} ms per 3-department create/edit).
`);
} finally {
  await cleanup();
  console.log(`cleaned up ${created.length} probe events`);
}
