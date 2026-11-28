/**
 * Headless-Edge probe for the filter dialog's level-1 order + whole-group
 * All/Clear (raw CDP, no MCP — Chrome DevTools MCP is not configured here).
 *
 * Logs in with the break-glass admin secret, opens the filter dialog on the
 * given route, and asserts the DOM facts behind 1.446:
 *   · level 1 lists the groups then the Event-name row, last, under a hairline;
 *   · the level-1 aside (the old field strip) is gone from the DOM;
 *   · the name row drills into a panel that holds the field and lands on Back;
 *   · stepping back writes data-nav="back" and runs the list's enter animation;
 *   · the Users panel's All is ENABLED at rest (the 1.446 fix) and fills every
 *     department in one tap;
 *   · chips carry a colour transition (and none under reduced motion).
 * Everything is discarded with Cancel — no filter is ever applied.
 *
 * Usage: node .scratch/filter-name-last/probe.mjs --width 390 --height 844 --tag m390
 *        node .scratch/filter-name-last/probe.mjs --width 1280 --height 900 --tag d1280 --scheme dark
 *        node .scratch/filter-name-last/probe.mjs --url /settings/users --tag users --reduced-motion
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = "http://localhost:3000";
const PORT = 9341;
const CHROME = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const OUT = ".scratch/filter-name-last";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && !process.argv[i + 1]?.startsWith("--") ? process.argv[i + 1] : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);
const WIDTH = Number(arg("width", "390"));
const HEIGHT = Number(arg("height", "844"));
const TAG = arg("tag", WIDTH < 640 ? "m390" : `w${WIDTH}`);
const PATH = arg("url", "/dashboard");
const SCHEME = arg("scheme", "light");
const REDUCED = flag("reduced-motion");
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

// ---- 1. Session cookie over HTTP ------------------------------------------
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
    callbackUrl: `${BASE}${PATH}`,
    mode: "admin",
    phone: "",
    secret: get("ADMIN_INITIAL_PASSWORD"),
  }),
});
eat(loginRes);
const session = await (
  await fetch(`${BASE}/api/auth/session`, { headers: { cookie: cookieHeader() } })
).json();
if (!session?.user) {
  console.error("login failed — check ADMIN_INITIAL_PASSWORD in .env.local");
  process.exit(1);
}
const cookies = [...jar.entries()].map(([name, value]) => ({ name, value }));

// ---- 2. Headless browser ---------------------------------------------------
const PROFILE = join(tmpdir(), "c2-filter-name-last-profile");
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
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = targets.find((t) => t.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(500);
  }
  throw new Error("devtools endpoint never came up");
}

const ws = new WebSocket(await waitForTarget());
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});

let nextId = 1;
const pending = new Map();
const eventWaiters = [];
const consoleErrors = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
    return;
  }
  if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
    consoleErrors.push(msg.params.entry.text.slice(0, 200));
  }
  if (msg.method === "Runtime.exceptionThrown") {
    consoleErrors.push(
      (msg.params.exceptionDetails?.exception?.description || "exception").slice(0, 200),
    );
  }
  for (let i = eventWaiters.length - 1; i >= 0; i--) {
    if (eventWaiters[i].method === msg.method) {
      eventWaiters[i].resolve(msg.params);
      eventWaiters.splice(i, 1);
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
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};
const shot = async (name) => {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, "base64"), "base64");
};

await send("Log.enable");
await send("Runtime.enable");
await send("Page.enable");
await send("Network.enable");
for (const c of cookies) {
  await send("Network.setCookie", { name: c.name, value: c.value, domain: "localhost", path: "/" });
}
await send("Emulation.setDeviceMetricsOverride", {
  width: WIDTH,
  height: HEIGHT,
  deviceScaleFactor: 1,
  mobile: MOBILE,
});
// The app runs `defaultColorScheme="auto"`, so headless follows the OS (dark on
// this host) unless the ThemeToggle's persisted value says otherwise.
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `try { localStorage.setItem("mantine-color-scheme-value", ${JSON.stringify(SCHEME)}); } catch (e) {}`,
});
if (REDUCED) {
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
}
await send("Network.setCacheDisabled", { cacheDisabled: true });

await send("Page.navigate", { url: `${BASE}${PATH}` });
await waitEvent("Page.loadEventFired");

// Wait for the filter trigger, then open the dialog.
const findTrigger = `(() => {
  const b = [...document.querySelectorAll("button")].find((el) =>
    (el.getAttribute("aria-label") || "").toLowerCase().includes("filter"));
  return b ? (b.getAttribute("aria-label") || "") : null;
})()`;
let trigger = null;
for (let i = 0; i < 60 && !trigger; i++) {
  await sleep(500);
  trigger = await evaluate(findTrigger);
}
if (!trigger) throw new Error(`no filter trigger on ${PATH}`);

await evaluate(`(() => {
  const b = [...document.querySelectorAll("button")].find((el) =>
    (el.getAttribute("aria-label") || "").toLowerCase().includes("filter"));
  b.click();
  return true;
})()`);
await sleep(900);

// ---- 3. Level 1 -----------------------------------------------------------
const level1 = await evaluate(`(() => {
  const sheet = document.querySelector(".c2-filter-sheet");
  if (!sheet) return null;
  const list = sheet.querySelector(".c2-filter-sheet__list");
  const rows = [...(list?.querySelectorAll(".c2-filter-row") || [])].map((el) => ({
    aria: el.getAttribute("aria-label"),
    title: el.querySelector("span")?.textContent?.trim(),
    state: el.querySelector(".c2-filter-state")?.textContent?.trim(),
    h: Math.round(el.getBoundingClientRect().height),
    expanded: el.getAttribute("aria-expanded"),
  }));
  const rule = sheet.querySelector(".c2-filter-sheet__rule");
  const cs = getComputedStyle(sheet);
  return {
    scheme: document.documentElement.dataset.mantineColorScheme || null,
    trigger: ${JSON.stringify(trigger)},
    rows,
    ruleCount: sheet.querySelectorAll(".c2-filter-sheet__rule").length,
    ruleH: rule ? Math.round(rule.getBoundingClientRect().height) : null,
    ruleBg: rule ? getComputedStyle(rule).backgroundColor : null,
    ruleBeforeLast: rule ? rule.nextElementSibling?.className || null : null,
    aside: !!sheet.querySelector(".c2-filter-sheet__aside"),
    dataAside: sheet.hasAttribute("data-aside"),
    inputInList: !!list?.querySelector("input"),
    gridCols: cs.gridTemplateColumns,
    sheetW: Math.round(sheet.getBoundingClientRect().width),
    detailOpen: sheet.getAttribute("data-detail"),
    dataNav: sheet.getAttribute("data-nav"),
  };
})()`);
if (!level1) throw new Error("no .c2-filter-sheet after clicking the trigger");
await shot(`${TAG}-01-level1`);

// ---- 4. The Event-name row → its panel ------------------------------------
const nameRow = (level1.rows || []).find((r) => /event name/i.test(r.aria || ""));
const namePanel = nameRow
  ? await evaluate(`(async () => {
      const rows = [...document.querySelectorAll(".c2-filter-sheet__list .c2-filter-row")];
      rows[rows.length - 1].click();
      await new Promise((r) => setTimeout(r, 700));
      const sheet = document.querySelector(".c2-filter-sheet");
      const detail = sheet.querySelector(".c2-filter-sheet__detail");
      const input = detail?.querySelector("input");
      const list = sheet.querySelector(".c2-filter-sheet__list");
      const back = detail?.querySelector('[aria-label="Back to filters"]');
      return {
        detailLabel: detail?.getAttribute("aria-label") || null,
        detailTitle: detail?.querySelector("span")?.textContent?.trim() || null,
        stateWord: detail?.querySelector(".c2-filter-state")?.textContent?.trim() || null,
        focused: document.activeElement?.getAttribute("aria-label") || document.activeElement?.tagName,
        inputW: input ? Math.round(input.getBoundingClientRect().width) : null,
        inputValue: input?.value ?? null,
        hasAllNone: !!detail?.querySelector('[aria-label^="Select all Event"]'),
        hasClearPair: !!detail?.querySelector('[aria-label="Clear Event name"]'),
        dataDetail: sheet.getAttribute("data-detail"),
        listDisplay: list ? getComputedStyle(list).display : null,
        detailAnim: getComputedStyle(detail).animationName,
        backH: back ? Math.round(back.getBoundingClientRect().height) : null,
      };
    })()`)
  : null;
if (namePanel) await shot(`${TAG}-02-name-panel`);

// Type a term, check the row's state word follows, then clear it again.
const typed = namePanel
  ? await evaluate(`(async () => {
      const input = document.querySelector('.c2-filter-sheet__detail input');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, "night duty");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 350));
      const detail = document.querySelector(".c2-filter-sheet__detail");
      return {
        stateWord: detail.querySelector(".c2-filter-state")?.textContent?.trim() || null,
        clearBtn: !!detail.querySelector('[aria-label="Clear Event name"]'),
      };
    })()`)
  : null;
if (typed?.clearBtn) await shot(`${TAG}-03-name-typed`);

// ---- 5. Back → data-nav + the list's enter animation ----------------------
const back = await evaluate(`(async () => {
  const detail = document.querySelector(".c2-filter-sheet__detail");
  if (detail) detail.querySelector('[aria-label="Back to filters"]').click();
  await new Promise((r) => setTimeout(r, 90));
  const sheet = document.querySelector(".c2-filter-sheet");
  const list = sheet.querySelector(".c2-filter-sheet__list");
  const anim = list ? getComputedStyle(list).animation : null;
  const out = {
    dataNav: sheet.getAttribute("data-nav"),
    animationName: list ? getComputedStyle(list).animationName : null,
    animationDuration: list ? getComputedStyle(list).animationDuration : null,
    animation: anim,
    detailGone: !sheet.querySelector(".c2-filter-sheet__detail"),
  };
  // Now drill in again: the direction must flip to "in".
  const rows = [...sheet.querySelectorAll(".c2-filter-sheet__list .c2-filter-row")];
  rows[rows.length - 1].click();
  await new Promise((r) => setTimeout(r, 250));
  out.dataNavAfterDrill = sheet.getAttribute("data-nav");
  document.querySelector('.c2-filter-sheet__detail [aria-label="Back to filters"]')?.click();
  await new Promise((r) => setTimeout(r, 250));
  out.dataNavRestored = sheet.getAttribute("data-nav");
  return out;
})()`);

// ---- 6. Users panel: the whole-group All/Clear ----------------------------
const users = await evaluate(`(async () => {
  const sheet = document.querySelector(".c2-filter-sheet");
  const rows = [...sheet.querySelectorAll(".c2-filter-sheet__list .c2-filter-row")];
  const usersRow = rows.find((el) => /^users/i.test(el.getAttribute("aria-label") || ""));
  if (!usersRow) return { skipped: true };
  usersRow.click();
  await new Promise((r) => setTimeout(r, 700));
  const detail = sheet.querySelector(".c2-filter-sheet__detail");
  const all = detail.querySelector('[aria-label="Select all Users"]');
  const clear = detail.querySelector('[aria-label="Clear Users"]');
  const chips = [...detail.querySelectorAll(".c2-selectable-badge, .c2-filter-group-chip")];
  const before = {
    allDisabled: all?.disabled,
    clearDisabled: clear?.disabled,
    chips: chips.length,
    pressed: chips.filter((c) => c.getAttribute("aria-pressed") === "true").length,
    chipTransition: chips.length ? getComputedStyle(chips[0]).transitionProperty : null,
    chipTransitionDur: chips.length ? getComputedStyle(chips[0]).transitionDuration : null,
    rowState: usersRow.querySelector(".c2-filter-state")?.textContent?.trim(),
  };
  all?.click();
  await new Promise((r) => setTimeout(r, 450));
  const after = {
    allDisabled: all?.disabled,
    clearDisabled: clear?.disabled,
    pressed: [...detail.querySelectorAll(".c2-selectable-badge, .c2-filter-group-chip")].filter(
      (c) => c.getAttribute("aria-pressed") === "true",
    ).length,
    rowState: usersRow.querySelector(".c2-filter-state")?.textContent?.trim(),
  };
  // Section popups keep their own pair: check one is present and enabled.
  const groupChip = detail.querySelector(".c2-filter-group-chip");
  return { before, after, hasGroupChip: !!groupChip };
})()`);
await shot(`${TAG}-04-users-all`);

// ---- 6b. Event Types (a grid group): unchanged at rest, says "None" -------
const types = await evaluate(`(async () => {
  const sheet = document.querySelector(".c2-filter-sheet");
  const stepBack = sheet.querySelector('.c2-filter-sheet__detail [aria-label="Back to filters"]');
  if (stepBack) {
    stepBack.click();
    await new Promise((r) => setTimeout(r, 350));
  }
  const rows = [...sheet.querySelectorAll(".c2-filter-sheet__list .c2-filter-row")];
  const row = rows.find((el) => /^event types/i.test(el.getAttribute("aria-label") || ""));
  if (!row) return { skipped: true };
  row.click();
  await new Promise((r) => setTimeout(r, 700));
  const detail = sheet.querySelector(".c2-filter-sheet__detail");
  const all = detail.querySelector('[aria-label="Select all Event Types"]');
  const none = detail.querySelector('[aria-label="Clear Event Types"]');
  const out = {
    stateWord: row.querySelector(".c2-filter-state")?.textContent?.trim(),
    allDisabled: all?.disabled,
    noneDisabled: none?.disabled,
    noneLabel: none?.textContent?.trim(),
  };
  detail.querySelector('[aria-label="Back to filters"]')?.click();
  await new Promise((r) => setTimeout(r, 350));
  return out;
})()`);

// ---- 7. Discard everything -------------------------------------------------
const closed = await evaluate(`(async () => {
  const btn = [...document.querySelectorAll("button")].find(
    (el) => el.textContent.trim() === "Cancel" && el.closest("[role='dialog'], .mantine-Modal-content"),
  );
  btn?.click();
  await new Promise((r) => setTimeout(r, 500));
  return { cancelFound: !!btn, sheetGone: !document.querySelector(".c2-filter-sheet") };
})()`);

const report = {
  viewport: `${WIDTH}x${HEIGHT}`,
  scheme: SCHEME,
  reducedMotion: REDUCED,
  path: PATH,
  level1,
  namePanel,
  typed,
  back,
  users,
  types,
  closed,
  consoleErrors,
};
writeFileSync(`${OUT}/results-${TAG}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

ws.close();
chrome.kill();
process.exit(0);
