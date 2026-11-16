#!/usr/bin/env node
/**
 * Read-only latency probe for the responsiveness work.
 *
 * Measures the DB round-trip cost that the server-action pipelines pay per
 * sequential `await` (each one is a Neon round trip from this machine, the
 * same order of magnitude as a Cloud Run -> Neon hop in asia-southeast1).
 *
 * Usage: node .scratch/perf/probe-db.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import postgres from "postgres";

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, "..", "..", ".env.local");
let DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
    if (m) {
      DATABASE_URL = m[1].replace(/^["']|["']$/g, "").trim();
      break;
    }
  }
}
if (!DATABASE_URL) {
  console.error("No DATABASE_URL");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1, idle_timeout: 20, connect_timeout: 10 });

async function time(label, fn, runs = 12) {
  const samples = [];
  // one warm-up (never counted) so connection setup and plan caches settle
  await fn();
  for (let i = 0; i < runs; i += 1) {
    const t0 = performance.now();
    await fn();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  const p50 = samples[Math.floor(samples.length / 2)];
  const p95 = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))];
  console.log(
    `${label.padEnd(46)} p50 ${p50.toFixed(1).padStart(7)} ms   p95 ${p95
      .toFixed(1)
      .padStart(7)} ms   (n=${runs})`,
  );
  return p50;
}

const t0 = performance.now();
await sql`select 1`;
console.log(`cold connect + first query: ${(performance.now() - t0).toFixed(1)} ms\n`);

const rtt = await time("SELECT 1 (per-statement RTT)", () => sql`select 1`);
await time("settings singleton row", () => sql`select * from settings limit 1`);
await time(
  "google_event_cache metadata select (3 months)",
  () =>
    sql`select calendar_google_id, month, fetched_at from google_event_cache
        where month in ('2026-11','2026-12','2027-01') limit 200`,
);
await time(
  "dashboard views by user",
  () => sql`select id, view_type from user_dashboard_views limit 20`,
);
await time("event identity resolution (ids x4)", () =>
  sql`select id, google_calendar_id from calendars limit 4`,
);

await sql.end({ timeout: 5 });

const r = (n) => (n * rtt).toFixed(0);
console.log(`
Derived sequential cost (p50 RTT x statements, ignores server CPU):
  filter save today   ~2 statements + RSC revalidate = ~${r(2)} ms + RSC render
  filter save target ~1 statement                    = ~${r(1)} ms
  event save post-Google DB tail today (audit + epoch bump + cache delete +
    pinned delete + 2 name lookups)                   = ~${r(6)} ms serial
  event save target (names overlapped with Google writes, tail parallel)
                                                      = ~${r(2)} ms
`);
