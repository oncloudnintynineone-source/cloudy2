#!/usr/bin/env node
/**
 * Server-action latency probe against the running dev server.
 *
 * Logs in through NextAuth, then invokes real server actions over HTTP with the
 * same `Next-Action` protocol the client uses. Reads the action ids from the
 * dev build's server-reference manifest. Mutations are idempotent (a filter save
 * writes the tab's existing filter values back; nothing visible changes).
 *
 * Usage: node .scratch/perf/probe-actions.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import postgres from "postgres";

const BASE = process.env.PERF_BASE ?? "http://localhost:3000";
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const env = {};
for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}

// ---- action ids ----------------------------------------------------------
const manifest = JSON.parse(
  readFileSync(join(root, ".next/dev/server/server-reference-manifest.json"), "utf8"),
);
const actionId = (file, name) => {
  for (const [id, entry] of Object.entries(manifest.node)) {
    if (entry.filename === file && entry.exportedName === name) return id;
  }
  throw new Error(`No action id for ${file} ${name}`);
};
const ids = {
  getSearchHistory: actionId("src/lib/events/searchHistoryActions.ts", "getSearchHistory"),
  saveFilters: actionId("src/lib/dashboardViews/actions.ts", "saveDashboardViewFilters"),
  renameView: actionId("src/lib/dashboardViews/actions.ts", "renameDashboardView"),
  reorderViews: actionId("src/lib/dashboardViews/actions.ts", "reorderDashboardViews"),
  createView: actionId("src/lib/dashboardViews/actions.ts", "createDashboardView"),
  deleteView: actionId("src/lib/dashboardViews/actions.ts", "deleteDashboardView"),
};

// ---- target staff user ---------------------------------------------------
const sql = postgres(env.DATABASE_URL, { max: 1 });
const [settings] = await sql`select user_keyword from settings limit 1`;
const [staff] = await sql`
  select id, name, phone from users
  where role = 'user' and status = 'active' and phone is not null
  order by created_at limit 1`;
const views = staff
  ? await sql`select id, name, sort_order, cal_filter, users_filter, types_filter, text_filter
              from user_dashboard_views where user_id = ${staff.id}
              order by sort_order, created_at`
  : [];
const view = views[0];
await sql.end({ timeout: 5 });
if (!staff || !view) {
  console.error("No staff user with a dashboard view in the dev DB");
  process.exit(1);
}
console.log(`staff user ${staff.name} (${staff.phone}), ${views.length} views, first ${view.id}`);

// ---- login ---------------------------------------------------------------
const jar = new Map();
function storeCookies(res) {
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";");
    const idx = pair.indexOf("=");
    if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}
const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
storeCookies(csrfRes);
const { csrfToken } = await csrfRes.json();
const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookieHeader() },
  body: new URLSearchParams({
    csrfToken,
    mode: "staff",
    input: `${staff.phone}${settings.user_keyword}`,
    callbackUrl: `${BASE}/dashboard`,
    json: "true",
  }),
  redirect: "manual",
});
storeCookies(loginRes);
const session = await (
  await fetch(`${BASE}/api/auth/session`, { headers: { cookie: cookieHeader() } })
).json();
if (!session?.user?.id) {
  console.error("Staff login failed", loginRes.status);
  process.exit(1);
}
console.log(`signed in as ${session.user.id} (${session.user.role})\n`);

// ---- action calls --------------------------------------------------------
async function callAction(id, args) {
  return fetch(`${BASE}/dashboard`, {
    method: "POST",
    headers: {
      "content-type": "text/plain;charset=UTF-8",
      accept: "text/x-component",
      "next-action": id,
      cookie: cookieHeader(),
    },
    body: JSON.stringify(args),
  });
}

// Smoke test: a no-arg action, then the filter write with the tab's current
// values (idempotent — it rewrites the same filters).
const smoke = await callAction(ids.getSearchHistory, []);
const smokeText = await smoke.text();
console.log(`getSearchHistory: HTTP ${smoke.status}, ${smokeText.length} bytes`);

const args = [
  view.id,
  {
    cal: view.cal_filter ?? null,
    users: view.users_filter ?? null,
    types: view.types_filter ?? null,
    text: view.text_filter ?? null,
  },
];

async function timed(label, fn, runs = 5) {
  const samples = [];
  await fn(); // warm
  for (let i = 0; i < runs; i += 1) {
    const t0 = performance.now();
    const res = await fn();
    const text = await res.text();
    if (!res.ok) {
      console.error(`\n${label} failed: HTTP ${res.status}\n${text.slice(0, 800)}`);
      process.exit(1);
    }
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  const p50 = samples[Math.floor(samples.length / 2)];
  const p95 = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))];
  console.log(
    `${label.padEnd(52)} p50 ${p50.toFixed(0).padStart(6)} ms  p95 ${p95.toFixed(0).padStart(6)} ms  (n=${runs})`,
  );
  return p50;
}

async function callActionResult(id, args) {
  const res = await callAction(id, args);
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  for (const line of text.split("\n")) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    try {
      const value = JSON.parse(line.slice(colon + 1));
      if (value && typeof value === "object" && "ok" in value) return value;
    } catch {
      // not a JSON row
    }
  }
  throw new Error(`No action result in: ${text.slice(0, 500)}`);
}

await timed("saveDashboardViewFilters (server action round trip)", () =>
  callAction(ids.saveFilters, args),
);
// Control: rename the tab to its existing name. Same action shape, but it still
// pays the owned-view SELECT and `revalidatePath("/dashboard")` RSC re-render —
// the delta against the save above is the cost this change removed.
await timed("renameDashboardView (control: + SELECT + RSC revalidate)", () =>
  callAction(ids.renameView, [view.id, { name: view.name }]),
);
await timed(`reorderDashboardViews (${views.length} views)`, () =>
  callAction(ids.reorderViews, [views.map((entry) => entry.id)]),
);

// Create/delete a throwaway tab so both CRUD paths are measured end-to-end and
// the strip is left exactly as found.
for (let i = 0; i < 2; i += 1) {
  let t0 = performance.now();
  const created = await callActionResult(ids.createView, [
    { viewType: "month", name: `Perf probe ${i}` },
  ]);
  const createMs = performance.now() - t0;
  if (!created.ok || !created.id) throw new Error(`create failed: ${created.error}`);
  t0 = performance.now();
  const deleted = await callActionResult(ids.deleteView, [created.id]);
  const deleteMs = performance.now() - t0;
  if (!deleted.ok) throw new Error(`delete failed: ${deleted.error}`);
  console.log(
    `createDashboardView / deleteDashboardView (one tab)   p50-ish ${createMs.toFixed(0)} / ${deleteMs.toFixed(0)} ms  (n=2)`,
  );
}

async function loadData() {
  const res = await fetch(`${BASE}/api/dashboard/load`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cloudy2-api": "1",
      cookie: cookieHeader(),
    },
    body: JSON.stringify({ view: view.id, month: null, date: null }),
  });
  return (await res.json())?.record?.data ?? {};
}

// Reorder correctness: reverse the strip, read it back, restore the original.
const originalOrder = views.map((entry) => entry.id);
try {
  const reversed = [...originalOrder].reverse();
  const result = await callActionResult(ids.reorderViews, [reversed]);
  if (!result.ok) throw new Error(`reorder failed: ${result.error}`);
  const reloaded = await loadData();
  const order = (reloaded.tabs ?? []).map((tab) => tab.id);
  console.log(
    `reorder round-trip persisted: ${JSON.stringify(order) === JSON.stringify(reversed) ? "OK" : "MISMATCH"}`,
  );
} finally {
  await callActionResult(ids.reorderViews, [originalOrder]);
}
const missing = await callActionResult(ids.deleteView, [crypto.randomUUID()]);
console.log(
  `delete unknown view → ${missing.ok ? "UNEXPECTED OK" : JSON.stringify(missing.error)}`,
);

// ---- semantic check: no RSC revalidation still means the data read is fresh --
const originalText = view.text_filter ?? null;
const probeText = "responsiveness-probe";
async function saveFilters(text) {
  const res = await callAction(ids.saveFilters, [view.id, { ...args[1], text }]);
  if (!res.ok) throw new Error(`filter save failed: HTTP ${res.status} ${await res.text()}`);
  await res.text();
}
await saveFilters(probeText);
const loadRes = await fetch(`${BASE}/api/dashboard/load`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-cloudy2-api": "1", cookie: cookieHeader() },
  body: JSON.stringify({ view: view.id, month: null, date: null }),
});
const loaded = await loadRes.json();
const data = loaded?.record?.data ?? {};
const tab = (data.tabs ?? []).find((entry) => entry.id === view.id);
const applied = tab?.filters?.text ?? null;
console.log(
  `\nafter save + /api/dashboard/load: filters.text = ${JSON.stringify(applied)} ` +
    `(expected ${JSON.stringify(probeText)}) → ${applied === probeText ? "OK" : "MISMATCH"}`,
);
// Also confirm the grid actually came back filtered by that text.
const eventCount = (data.events ?? []).length;
console.log(`filtered event count for the probe text: ${eventCount}`);
console.log(
  `tab count after CRUD: ${(data.tabs ?? []).length} (expected ${views.length}) ` +
    `→ ${(data.tabs ?? []).length === views.length ? "OK" : "MISMATCH"}`,
);
await saveFilters(originalText);
console.log("restored the original filter value");

