/**
 * Headless-Chrome screenshot of /settings/metrics via raw CDP (no MCP needed):
 * injects the dev session cookie, opens the Configuration accordion, captures
 * desktop + mobile viewports.
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9333;
// Cookie lives in the OS temp dir (see copy.mjs) — never in the workspace.
const cookies = JSON.parse(readFileSync(join(tmpdir(), "c2-metrics-cookies.json"), "utf8"));
const PROFILE = process.env.TEMP + "\\c2-shot-edge-profile"; // outside the workspace: ESLint must not lint a browser profile

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
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForTarget() {
  for (let i = 0; i < 60; i++) {
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
const waitEvent = (method, timeoutMs = 30000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting ${method}`)), timeoutMs);
    eventWaiters.push({ method, resolve: (p) => (clearTimeout(t), resolve(p)) });
  });

await send("Network.enable");
for (const c of cookies) {
  await send("Network.setCookie", { name: c.name, value: c.value, domain: "localhost", path: "/" });
}
await send("Page.enable");
await send("Runtime.enable");

async function shot(name, width, height, mobile, openConfig) {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
  });
  await send("Page.navigate", { url: "http://localhost:3000/settings/metrics" });
  await waitEvent("Page.loadEventFired");
  await sleep(2500); // client hydration + data settle
  if (openConfig) {
    await send("Runtime.evaluate", {
      expression: `
        (() => {
          const ctrl = [...document.querySelectorAll('.mantine-Accordion-control')]
            .find((el) => el.textContent.includes('Configuration'));
          if (ctrl) { ctrl.click(); return 'clicked'; }
          // fallback: any element whose text is exactly Configuration
          const el = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Configuration');
          if (el) { el.click(); return 'clicked-fallback'; }
          return 'not-found';
        })()`,
      returnByValue: true,
    }).then((r) => console.log(`[${name}] accordion:`, r.result?.value));
    await sleep(1200);
    if (openConfig) {
      await send("Runtime.evaluate", {
        expression: `
          (() => {
            const panel = [...document.querySelectorAll('.mantine-Accordion-panel')].pop();
            if (panel) panel.scrollIntoView({ block: 'start' });
            return panel ? 'scrolled' : 'no-panel';
          })()`,
        returnByValue: true,
      });
      await sleep(600);
    }
  }
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`.scratch/metrics-debug/${name}.png`, Buffer.from(data, "base64"), "base64");
  console.log(`[${name}] saved`);
}

await shot("metrics-desktop", 1280, 1100, false, true);
await shot("metrics-mobile", 390, 844, true, true);
await shot("metrics-mobile-closed", 390, 844, true, false);

ws.close();
chrome.kill();
process.exit(0);
