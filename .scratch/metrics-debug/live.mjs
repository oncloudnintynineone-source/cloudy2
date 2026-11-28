/**
 * Live end-to-end verification of the metrics fixes against the local dev
 * server (same dev Neon DB). Flow: NextAuth credentials login (break-glass
 * admin) → dashboard load/preload (egress counters + flush) → metrics tick
 * (lazy close of yesterday) → DB assertions → settings page copy check.
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";

const env = readFileSync(".env.local", "utf8");
const get = (k) =>
  env
    .split(/\r?\n/)
    .find((l) => l.startsWith(k + "="))
    ?.slice(k.length + 1)
    .trim()
    .replace(/^["']|["']$/g, "");

const BASE = "http://localhost:3000";
const jar = new Map();
const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
function eat(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
}

// 1. Login (NextAuth v4 credentials, break-glass root).
const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
eat(csrfRes);
const { csrfToken } = await csrfRes.json();
const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
  method: "POST",
  redirect: "manual",
  headers: {
    "content-type": "application/x-www-form-urlencoded",
    cookie: cookieHeader(),
  },
  body: new URLSearchParams({
    csrfToken,
    json: "true",
    callbackUrl: `${BASE}/dashboard`,
    mode: "admin",
    phone: "",
    secret: get("ADMIN_INITIAL_PASSWORD"),
  }),
});
eat(loginRes);
const sessionRes = await fetch(`${BASE}/api/auth/session`, { headers: { cookie: cookieHeader() } });
const session = await sessionRes.json();
console.log("1. login:", session?.user?.role ?? "FAILED", "| status", loginRes.status);
if (!session?.user) process.exit(1);

const api = {
  headers: { "content-type": "application/json", "x-cloudy2-api": "1", cookie: cookieHeader() },
};

// 2. Dashboard reads → egress counters; first flush is immediate.
const loadRes = await fetch(`${BASE}/api/dashboard/load`, { method: "POST", ...api, body: "{}" });
const loadBody = await loadRes.text();
console.log("2. load:", loadRes.status, `${loadBody.length} bytes`);
const preloadRes = await fetch(`${BASE}/api/dashboard/preload`, {
  method: "POST",
  ...api,
  body: JSON.stringify({ adjacentOnly: true }),
});
console.log("3. preload:", preloadRes.status, `${(await preloadRes.text()).length} bytes`);

// 3. Tick → lazy snapshot closes yesterday (2026-11-27).
const tickRes = await fetch(`${BASE}/api/metrics/tick`, { method: "POST", ...api, body: "{}" });
console.log("4. tick:", tickRes.status, await tickRes.text());
await new Promise((r) => setTimeout(r, 4000)); // let after() hooks finish

// 4. DB assertions.
const sql = postgres(get("DATABASE_URL"), { max: 1, connect_timeout: 15 });
const day = await sql`SELECT day, metric, label_key, value FROM metrics_day ORDER BY day, metric, label_key LIMIT 40`;
console.log("5. metrics_day:", day.length, "rows");
for (const r of day.filter((x) => ["compute.active_minutes", "storage.db_bytes", "egress.app_bytes", "requests.total"].includes(x.metric)))
  console.log("   ", r.day.toISOString().slice(0, 10), r.metric, r.label_key, r.value);
const running = await sql`SELECT day, metric, label_key, value FROM metrics_running ORDER BY day, metric, label_key`;
console.log("6. metrics_running:");
for (const r of running)
  console.log("   ", r.day.toISOString().slice(0, 10), r.metric, r.label_key, r.value);
const claims = await sql`SELECT day, status, attempts FROM metrics_claim ORDER BY day`;
console.log("7. claims:", JSON.stringify(claims.map((c) => ({ day: c.day.toISOString().slice(0, 10), status: c.status }))));
const audit = await sql`SELECT entity_name, details->>'trigger' AS trigger, details->>'outcome' AS outcome, details->>'days' AS days FROM audit_logs WHERE action = 'metrics.snapshot' ORDER BY created_at DESC LIMIT 2`;
console.log("8. audit:", JSON.stringify(audit));
await sql.end();

// 5. Settings page copy (server-rendered).
const pageRes = await fetch(`${BASE}/settings/metrics`, { headers: { cookie: cookieHeader() } });
const html = await pageRes.text();
console.log("9. settings page:", pageRes.status);
for (const needle of [
  "the ledger closes each day at/after",
  "closes the previous day on the first app activity",
  "The earliest time of day the ledger may close a day",
]) {
  console.log("   ", html.includes(needle) ? "FOUND" : "missing", "→", JSON.stringify(needle));
}

// 6. After the flush interval, one more load flushes the buffered preload rows.
console.log("10. waiting 65s for the next flush window…");
await new Promise((r) => setTimeout(r, 65_000));
const load2 = await fetch(`${BASE}/api/dashboard/load`, { method: "POST", ...api, body: "{}" });
console.log("    load2:", load2.status);
await new Promise((r) => setTimeout(r, 3000));
const sql2 = postgres(get("DATABASE_URL"), { max: 1, connect_timeout: 15 });
const running2 = await sql2`SELECT day, metric, label_key, value FROM metrics_running ORDER BY day, metric, label_key`;
console.log("11. metrics_running after second flush:");
for (const r of running2)
  console.log("   ", r.day.toISOString().slice(0, 10), r.metric, r.label_key, r.value);
await sql2.end();
