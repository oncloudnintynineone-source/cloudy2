#!/usr/bin/env node
/**
 * Google Calendar API latency probe (read-only).
 *
 * Times `events.list` (the call every event write pipeline makes to find a
 * logical event's copies) for one department calendar/month, then the same
 * reads for three calendars serial vs concurrent — the shapes the event
 * create/update/delete pipelines use today vs the target.
 *
 * Usage: node .scratch/perf/probe-google.mjs
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
if (rows.length === 0) {
  console.error("No calendars in the DB");
  process.exit(1);
}
const gids = rows.map((r) => r.google_calendar_id);

const now = new Date();
const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

const list = (calendarId) =>
  calendar.events.list({
    calendarId,
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 2500,
  });

async function timed(label, fn, runs = 5) {
  const samples = [];
  await fn();
  for (let i = 0; i < runs; i += 1) {
    const t0 = performance.now();
    await fn();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  const p50 = samples[Math.floor(samples.length / 2)];
  console.log(`${label.padEnd(46)} p50 ${p50.toFixed(0).padStart(6)} ms  (n=${runs})`);
  return p50;
}

const one = await timed("events.list — 1 calendar", () => list(gids[0]));
await timed("events.list — 3 calendars serial", async () => {
  for (const gid of gids) await list(gid);
});
const three = await timed("events.list — 3 calendars concurrent", () =>
  Promise.all(gids.map((gid) => list(gid))),
);

console.log(`
one call ~ ${one.toFixed(0)} ms; three serial ~ ${(one * 3).toFixed(0)} ms predicted,
three concurrent measured ~ ${three.toFixed(0)} ms.
Post-write reads are already bounded-concurrent in update/delete; the writes are
still serial per copy, and create still resolves calendar ids one query at a time.
`);
