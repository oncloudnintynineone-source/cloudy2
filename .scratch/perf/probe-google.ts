#!/usr/bin/env node
/**
 * Google Calendar API latency probe (read-only).
 *
 * Times `events.list` for one department calendar/month, then the same reads
 * for three calendars serial vs concurrent — the two shapes the event
 * create/update/delete pipelines use today (serial) and the target shape
 * (bounded concurrent).
 *
 * Usage: pnpm exec tsx .scratch/perf/probe-google.ts
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(join(here, "..", "..", ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !(m[1] in process.env)) {
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}

const postgres = (await import("postgres")).default;
const { getGoogleIntegration, googleCalendarConfigured } = await import("../../src/lib/google/index");
const { monthRange } = await import("../../src/lib/events/datetime");

if (!googleCalendarConfigured()) {
  console.error("Google is not configured in .env.local");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const calendars = await sql`select id, google_calendar_id from calendars limit 3`;
await sql.end({ timeout: 5 });
if (calendars.length === 0) {
  console.error("No calendars in the DB");
  process.exit(1);
}

const integration = await getGoogleIntegration();
const month = new Date().toISOString().slice(0, 7);
const { start, end } = monthRange(month);
const gids = calendars.map((c) => c.google_calendar_id);

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
  console.log(`${label.padEnd(50)} p50 ${p50.toFixed(0).padStart(6)} ms  (n=${runs})`);
  return p50;
}

const one = await timed("events.list — 1 calendar, 1 month", () =>
  integration.listEvents(gids[0], start, end),
);
await timed("events.list — 3 calendars serial", async () => {
  for (const gid of gids) await integration.listEvents(gid, start, end);
});
const parallel = await timed("events.list — 3 calendars concurrent", () =>
  Promise.all(gids.map((gid) => integration.listEvents(gid, start, end))),
);

console.log(`
1 call ~ ${one.toFixed(0)} ms; 3 serial ~ ${(one * 3).toFixed(0)} ms predicted,
3 concurrent measured ${parallel.toFixed(0)} ms.
A 3-department event write pipeline runs its Google calls serially today; the
bounded-concurrent target costs ~one call instead of three.
`);
