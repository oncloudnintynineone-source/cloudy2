#!/usr/bin/env node
/**
 * End-to-end HTTP latency probe against the running dev server (read-only).
 *
 * Logs in as the break-glass root (ADMIN_INITIAL_PASSWORD from .env.local),
 * then times the dashboard route's RSC render (`GET /dashboard`) and the data
 * read (`POST /api/dashboard/load`). The RSC render is exactly the extra work a
 * `revalidatePath("/dashboard")` inside a server action forces on the client
 * after the action resolves.
 *
 * Usage: node .scratch/perf/probe-http.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.PERF_BASE ?? "http://localhost:3000";
const here = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const line of readFileSync(join(here, "..", "..", ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}

const jar = new Map();
function storeCookies(res) {
  const list = res.headers.getSetCookie?.() ?? [];
  for (const raw of list) {
    const [pair] = raw.split(";");
    const idx = pair.indexOf("=");
    if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}
function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
storeCookies(csrfRes);
const { csrfToken } = await csrfRes.json();

const body = new URLSearchParams({
  csrfToken,
  mode: "admin",
  secret: env.ADMIN_INITIAL_PASSWORD ?? "",
  phone: "",
  callbackUrl: `${BASE}/dashboard`,
  json: "true",
});
const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookieHeader() },
  body,
  redirect: "manual",
});
storeCookies(loginRes);
const loginText = await loginRes.text();
const sessionRes = await fetch(`${BASE}/api/auth/session`, { headers: { cookie: cookieHeader() } });
const session = await sessionRes.json();
if (!session?.user) {
  console.error("Login failed", loginRes.status, loginText.slice(0, 300));
  process.exit(1);
}
console.log(`signed in as ${session.user.id} (${session.user.role})\n`);

async function timed(label, fn, runs = 5) {
  const samples = [];
  await fn(); // warm (route compile / cold cache)
  for (let i = 0; i < runs; i += 1) {
    const t0 = performance.now();
    await fn();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  const p50 = samples[Math.floor(samples.length / 2)];
  const p95 = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))];
  console.log(`${label.padEnd(46)} p50 ${p50.toFixed(0).padStart(6)} ms  p95 ${p95.toFixed(0).padStart(6)} ms  (n=${runs})`);
  return { p50, p95 };
}

const load = () =>
  fetch(`${BASE}/api/dashboard/load`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cloudy2-api": "1",
      cookie: cookieHeader(),
    },
    body: JSON.stringify({ view: null, month: null, date: null }),
  });

await timed("POST /api/dashboard/load (data read)", load);
await timed("GET /dashboard (RSC shell render)", () =>
  fetch(`${BASE}/dashboard`, { headers: { cookie: cookieHeader() } }),
);

console.log(`
A filter apply today = server-action DB write + revalidatePath("/dashboard")
RSC render + the data read above. Dropping the RSC revalidation removes the
middle leg; collapsing the view-ownership SELECT removes one DB round trip.
`);
