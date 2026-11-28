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
    callbackUrl: `${BASE}/dashboard`,
    mode: "admin",
    phone: "",
    secret: get("ADMIN_INITIAL_PASSWORD"),
  }),
});
eat(loginRes);

for (const path of ["/dashboard", "/settings/metrics", "/settings/general", "/parade-state"]) {
  const res = await fetch(`${BASE}${path}`, { headers: { cookie: cookieHeader() } });
  console.log(path, res.status);
}
