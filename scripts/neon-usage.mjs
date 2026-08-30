#!/usr/bin/env node
/**
 * Print daily Neon usage (compute active time, CPU seconds, egress, storage)
 * from the Neon consumption-history API, so you can verify DB-load changes
 * (e.g. the events-cache read-path optimizations in docs/events-cache.md).
 *
 * Requirements: Node >= 20 (uses the built-in fetch), a Neon API key, and the
 * Neon organization id. Set them in .env.local (read here) or the shell env:
 *
 *   NEON_API_KEY=<from console.neon.tech → Account → API keys>
 *   NEON_ORG_ID=<your organization slug/id>
 *   NEON_PROJECT_ID=<optional: filter to one project>
 *
 * Usage:
 *   node scripts/neon-usage.mjs                 # last 14 days
 *   node scripts/neon-usage.mjs --from 2026-07-01 --to 2026-07-31
 *
 * Note: the Neon free plan is capped on *active time* (100 hours/month) and
 * egress (5 GB/month); compute_unit_seconds is CPU utilization. If the
 * consumption API is not available on your plan (403/404), the numbers are
 * still visible in the Neon Console → Billing → Usage page.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

function loadEnvFile() {
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = join(here, "..", ".env.local");
  try {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const value = m[2].replace(/^["']|["']$/g, "").trim();
      if (!(m[1] in process.env)) {
        process.env[m[1]] = value;
      }
    }
  } catch {
    // No .env.local — rely on the shell environment.
  }
}
loadEnvFile();

const args = process.argv.slice(2);
function argValue(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const now = new Date();
const defaultTo = `${now.toISOString().slice(0, 10)}T23:59:59Z`;
const defaultFrom = `${new Date(now.getTime() - 14 * 86_400_000)
  .toISOString()
  .slice(0, 10)}T00:00:00Z`;
const from = argValue("--from") ?? defaultFrom;
const to = argValue("--to") ?? defaultTo;

const { NEON_API_KEY, NEON_ORG_ID, NEON_PROJECT_ID } = process.env;
if (!NEON_API_KEY || !NEON_ORG_ID) {
  console.error("Missing NEON_API_KEY / NEON_ORG_ID (set them in .env.local or the shell).");
  process.exit(1);
}

const metrics = (
  argValue("--metrics") ??
  "active_time_seconds,compute_unit_seconds,public_network_transfer_bytes,written_data_bytes,root_branch_bytes_month"
).split(",");

const params = new URLSearchParams({
  org_id: NEON_ORG_ID,
  from,
  to,
  granularity: "daily",
  limit: "100",
  metrics: metrics.join(","),
});
if (NEON_PROJECT_ID) {
  params.set("project_ids", NEON_PROJECT_ID);
}
const url = `https://console.neon.tech/api/v2/consumption_history/v2/projects?${params}`;

const res = await fetch(url, { headers: { Authorization: `Bearer ${NEON_API_KEY}` } });
if (!res.ok) {
  const body = await res.text().catch(() => "");
  console.error(`Consumption API ${res.status}.`);
  if (body) console.error(body.slice(0, 800));
  if (res.status === 403 || res.status === 404) {
    console.error(
      "The consumption API may not be exposed on your plan — use the Neon Console → Billing → Usage page instead.",
    );
  }
  console.error("Try --metrics with only known keys, e.g. compute_unit_seconds,public_network_transfer_bytes.");
  process.exit(1);
}

const data = await res.json();

/** Normalize a period object into the metric numbers we understand. */
function readMetrics(period) {
  const m = period?.metrics && typeof period.metrics === "object" ? period.metrics : period ?? {};
  const get = (key) => (typeof m[key] === "number" ? m[key] : 0);
  return {
    activeSeconds: get("active_time_seconds"),
    computeUnitSeconds: get("compute_unit_seconds"),
    egressBytes: get("public_network_transfer_bytes"),
    writtenBytes: get("written_data_bytes"),
    storageBytes: get("root_branch_bytes_month"),
  };
}

const projects = Array.isArray(data?.projects) ? data.projects : [];
if (projects.length === 0) {
  console.error("No project consumption returned for the given range/org.");
  process.exit(1);
}

const summary = { activeSeconds: 0, computeUnitSeconds: 0, egressBytes: 0, writtenBytes: 0 };
for (const project of projects) {
  const label = project.name ?? project.project_id ?? project.id ?? "project";
  console.log(`\n== ${label} ==`);
  console.log(
    "date          active-hrs   cpu-secs   egress(MB)  written(MB)  storage(GB)",
  );
  const periods = project.periods ?? project.data ?? [];
  for (const period of periods) {
    const m = readMetrics(period);
    summary.activeSeconds += m.activeSeconds;
    summary.computeUnitSeconds += m.computeUnitSeconds;
    summary.egressBytes += m.egressBytes;
    summary.writtenBytes += m.writtenBytes;
    const day = (period.from ?? "?").slice(0, 10);
    console.log(
      `${day.padEnd(14)}${(m.activeSeconds / 3600).toFixed(2).padStart(9)}   ` +
        `${String(m.computeUnitSeconds).padStart(8)}  ` +
        `${(m.egressBytes / 1048576).toFixed(1).padStart(9)}  ` +
        `${(m.writtenBytes / 1048576).toFixed(1).padStart(9)}  ` +
        `${(m.storageBytes / 1073741824).toFixed(2).padStart(9)}`,
    );
  }
}

const activeHours = summary.activeSeconds / 3600;
const egressGb = summary.egressBytes / 1073741824;
const cpuHours = summary.computeUnitSeconds / 3600;
console.log(`\n-- Totals (${from.slice(0, 10)} → ${to.slice(0, 10)}) --`);
console.log(`Active compute:    ${activeHours.toFixed(2)} h`);
console.log(`  free-tier cap:   100 h/month  →  ${((activeHours / 100) * 100).toFixed(0)}% of it in this window`);
console.log(`CPU compute:       ${cpuHours.toFixed(2)} h`);
console.log(`Egress:            ${egressGb.toFixed(2)} GB`);
console.log(`  free-tier cap:   5 GB/month  →  ${((egressGb / 5) * 100).toFixed(0)}% of it in this window`);
console.log(`Data written:      ${(summary.writtenBytes / 1073741824).toFixed(2)} GB`);