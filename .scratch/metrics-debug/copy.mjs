import { readFileSync } from "node:fs";

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

const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
eat(csrfRes);
const { csrfToken } = await csrfRes.json();
const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
  method: "POST",
  redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookieHeader() },
  body: new URLSearchParams({
    csrfToken,
    json: "true",
    callbackUrl: `${BASE}/settings/metrics`,
    mode: "admin",
    phone: "",
    secret: get("ADMIN_INITIAL_PASSWORD"),
  }),
});
eat(loginRes);

const res = await fetch(`${BASE}/settings/metrics`, { headers: { cookie: cookieHeader() } });
const html = await res.text();
console.log("settings/metrics:", res.status);
for (const needle of [
  "the ledger closes each day at/after",
  "closes the previous day on the first app activity",
  "The earliest time of day the ledger may close a day",
  "Last closed",
  "2026-11-27",
]) {
  console.log(html.includes(needle) ? "FOUND  " : "missing", "→", JSON.stringify(needle));
}
// Save the HTML (temp dir — the workspace stays free of committed junk).
const { writeFileSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const { join } = await import("node:path");
writeFileSync(join(tmpdir(), "c2-metrics-settings.html"), html);
// The session cookie lives in the OS temp dir, never the workspace: .scratch/
// is tracked by convention, and a committed NextAuth JWT is a live credential.
const cookiePath = join(tmpdir(), "c2-metrics-cookies.json");
console.log("session cookie saved for screenshot script →", cookiePath);
writeFileSync(
  cookiePath,
  JSON.stringify([...jar.entries()].map(([name, value]) => ({ name, value }))),
);
