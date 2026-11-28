/**
 * Headless-Edge probe for the modal skeleton reveal (raw CDP, no MCP).
 *
 * Logs in with the break-glass admin env secret, then on `/dashboard` clicks
 * the New-event control and samples the open dialog's height every animation
 * frame. The wizard's lazy skeleton is exactly the form's fixed body height, so
 * a correct reveal shows one plateau (skeleton) that continues into the form; a
 * recorded-at-0 skeleton (a kept-mounted dialog's `display:none` opening
 * frames) shows up as a dip to the header height followed by an expand.
 *
 * Cookies and the browser profile live in %TEMP%, never the workspace.
 *
 * Usage: node .scratch/modal-reveal/probe.mjs [--width 1280] [--height 1000] [--tag d1280]
 *        node .scratch/modal-reveal/probe.mjs --width 390 --height 844 --tag m390
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = "http://localhost:3000";
const PORT = 9333;
const CHROME = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const OUT = ".scratch/modal-reveal";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const WIDTH = Number(arg("width", "1280"));
const HEIGHT = Number(arg("height", "1000"));
const TAG = arg("tag", `w${WIDTH}`);
const PATH = arg("url", "/dashboard");
const CONTROL = arg("control", "new event");
const MOBILE = WIDTH < 640;

const env = readFileSync(".env.local", "utf8");
const get = (k) =>
  env
    .split(/\r?\n/)
    .find((l) => l.startsWith(k + "="))
    ?.slice(k.length + 1)
    .trim()
    .replace(/^["']|["']$/g, "");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 1. Session cookie (HTTP login, jar kept by the running dev server) ----
const jar = new Map();
const eat = (res) => {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
};
const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

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
const sessionRes = await fetch(`${BASE}/api/auth/session`, { headers: { cookie: cookieHeader() } });
const session = await sessionRes.json();
if (!session?.user) {
  console.error("login failed — check ADMIN_INITIAL_PASSWORD in .env.local");
  process.exit(1);
}
const cookies = [...jar.entries()].map(([name, value]) => ({ name, value }));
writeFileSync(join(tmpdir(), "c2-modal-reveal-cookies.json"), JSON.stringify(cookies));

// ---- 2. Headless browser ----
const PROFILE = join(tmpdir(), "c2-modal-reveal-profile");
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    "--remote-allow-origins=*",
    `--user-data-dir=${PROFILE}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--hide-scrollbars",
    "about:blank",
  ],
  { stdio: "ignore" },
);

async function waitForTarget() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(500);
  }
  throw new Error("chrome devtools endpoint never came up");
}

const wsUrl = await waitForTarget();
const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});

let nextId = 1;
const pending = new Map();
const eventWaiters = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  } else if (msg.method) {
    for (let i = eventWaiters.length - 1; i >= 0; i--) {
      if (eventWaiters[i].method === msg.method) {
        eventWaiters[i].resolve(msg.params);
        eventWaiters.splice(i, 1);
      }
    }
  }
};
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
const waitEvent = (method, timeoutMs = 60000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting ${method}`)), timeoutMs);
    eventWaiters.push({ method, resolve: (p) => (clearTimeout(t), resolve(p)) });
  });
const evaluate = async (expression, awaitPromise = true) => {
  const r = await send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};
const shot = async (name) => {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, "base64"), "base64");
};

await send("Network.enable");
for (const c of cookies) {
  await send("Network.setCookie", { name: c.name, value: c.value, domain: "localhost", path: "/" });
}
await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: WIDTH,
  height: HEIGHT,
  deviceScaleFactor: 1,
  mobile: MOBILE,
});
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Network.clearBrowserCache");
if (process.argv.includes("--reduced-motion")) {
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
}

// Load the dashboard unthrottled, then slow the dynamic chunk so the skeleton
// is comfortably observable.
await send("Page.navigate", { url: `${BASE}${PATH}` });
await waitEvent("Page.loadEventFired");
await sleep(2000);
await send("Network.emulateNetworkConditions", {
  offline: false,
  latency: 180,
  downloadThroughput: Math.round((350 * 1024) / 8),
  uploadThroughput: Math.round((120 * 1024) / 8),
});

// Sampler: the open dialog's LAYOUT height (`offsetHeight`, so the entrance
// scale transform cannot pollute it) and the wizard's crossfade wrapper height,
// which is the box the reveal actually locks/animates.
await evaluate(`(() => {
  window.__c2Reveal = { on: true, t0: performance.now(), series: [] };
  const visible = (el) => el.offsetHeight > 0 && getComputedStyle(el).display !== "none";
  (function tick() {
    const papers = [...document.querySelectorAll("[data-modal-content]")].filter(visible);
    const paper = papers.length
      ? Math.round(Math.max(...papers.map((el) => el.offsetHeight)))
      : 0;
    const stackEl = papers.length ? papers[0].querySelector(".c2-crossfade-stack") : null;
    window.__c2Reveal.series.push({
      t: Math.round(performance.now() - window.__c2Reveal.t0),
      paper,
      stack: stackEl ? Math.round(stackEl.offsetHeight) : 0,
    });
    if (window.__c2Reveal.on) requestAnimationFrame(tick);
  })();
  return "installed";
})()`);

await sleep(120);
const clicked = await evaluate(`(async () => {
  const all = [...document.querySelectorAll("button, a")];
  const control = ${JSON.stringify(CONTROL)}.toLowerCase();
  const target = all.find((el) => {
    const aria = (el.getAttribute("aria-label") || "").toLowerCase();
    const text = (el.textContent || "").trim().toLowerCase();
    return text === control || aria.includes(control);
  });
  if (!target) {
    return {
      clicked: false,
      labels: all
        .map((el) => el.getAttribute("aria-label") || (el.textContent || "").trim().slice(0, 24))
        .filter(Boolean)
        .slice(0, 40),
    };
  }
  target.click();
  await new Promise((r) => setTimeout(r, 60));
  return {
    clicked: true,
    label: target.getAttribute("aria-label") || target.textContent.trim(),
    disabled: target.disabled === true,
  };
})()`);
await sleep(140);
await shot(`${TAG}-01-skeleton`);

await sleep(5500);
await shot(`${TAG}-02-final`);
const result = await evaluate(`(() => {
  window.__c2Reveal.on = false;
  return window.__c2Reveal.series;
})()`);

const series = Array.isArray(result) ? result : [];
const compact = [];
for (const s of series) {
  const last = compact[compact.length - 1];
  if (!last || last.paper !== s.paper || last.stack !== s.stack) compact.push(s);
}
const openedAt = compact.findIndex((s) => s.paper > 0);
const opened = openedAt >= 0 ? compact.slice(openedAt) : [];
const peak = opened.reduce((m, s) => Math.max(m, s.paper), 0);
const minAfterOpen = opened.reduce((m, s) => Math.min(m, s.paper), peak);
const dip = peak > 0 && minAfterOpen < peak * 0.75;

console.log(`\n[${TAG}] path=${PATH} clicked=${clicked?.clicked} control=${JSON.stringify(clicked?.label)} disabled=${clicked?.disabled} viewport=${WIDTH}x${HEIGHT}`);
if (clicked?.labels) console.log(`[${TAG}] controls seen: ${JSON.stringify(clicked.labels)}`);
console.log(`[${TAG}] samples=${series.length} afterOpen=${opened.length} peak=${peak} minAfterOpen=${minAfterOpen} dip=${dip}`);
console.log(`[${TAG}] height series (t ms | dialog px | wrapper px):`);
console.log(compact.map((s) => `  ${String(s.t).padStart(4)} | ${String(s.paper).padStart(4)} | ${s.stack}`).join("\n"));

ws.close();
chrome.kill();
process.exit(dip ? 2 : 0);
