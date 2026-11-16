#!/usr/bin/env node
/**
 * End-to-end event-action probe against the running dev server.
 *
 * Logs in as a real staff user, then invokes `createEvent` / `updateEvent` /
 * `deleteEvent` over HTTP exactly as the wizard does, at a far-future date.
 * Times a one-department create against a three-department create (the two
 * shapes differ only by the per-copy Google fan-out), then removes every event
 * it made — including a direct Google sweep in `finally` if a delete call
 * failed.
 *
 * Usage: node .scratch/perf/probe-event-actions.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { google } from "googleapis";
import postgres from "postgres";

const BASE = process.env.PERF_BASE ?? "http://localhost:3000";
const MARKER = "cloudy2 responsiveness probe";
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const env = {};
for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}

const manifest = JSON.parse(
  readFileSync(join(root, ".next/dev/server/server-reference-manifest.json"), "utf8"),
);
const actionIdIn = (file, name) => {
  for (const [id, entry] of Object.entries(manifest.node)) {
    if (entry.filename === file && entry.exportedName === name) return id;
  }
  throw new Error(`No action id for ${file} ${name}`);
};
const ids = {
  create: actionIdIn("src/lib/events/actions.ts", "createEvent"),
  update: actionIdIn("src/lib/events/actions.ts", "updateEvent"),
  remove: actionIdIn("src/lib/events/actions.ts", "deleteEvent"),
  saveFilters: actionIdIn("src/lib/dashboardViews/actions.ts", "saveDashboardViewFilters"),
};

// ---- picks users across distinct departments ------------------------------
const sql = postgres(env.DATABASE_URL, { max: 1 });
const [settings] = await sql`select user_keyword from settings limit 1`;
const staffRows = await sql`
  select id, name, phone, department_id from users
  where role = 'user' and status = 'active' and phone is not null and department_id is not null
  order by created_at limit 6`;
const [firstView] = await sql`
  select id, cal_filter, users_filter, types_filter, text_filter
  from user_dashboard_views where user_id = ${staffRows[0]?.id ?? null}
  order by sort_order, created_at limit 1`;
await sql.end({ timeout: 5 });
if (staffRows.length === 0) {
  console.error("No staff users with a department");
  process.exit(1);
}
const staff = staffRows[0];
const distinct = [];
const seenDepts = new Set();
for (const row of staffRows) {
  if (!seenDepts.has(row.department_id)) {
    seenDepts.add(row.department_id);
    distinct.push(row);
  }
}
const invitees = distinct.slice(0, 3);
console.log(
  `staff ${staff.name}; invitees: ${invitees.map((u) => `${u.name} (dept ${u.department_id.slice(0, 8)})`).join(", ")}`,
);

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
  console.error("Login failed");
  process.exit(1);
}
console.log(`signed in as ${session.user.id}\n`);

async function callAction(id, args) {
  const res = await fetch(`${BASE}/dashboard`, {
    method: "POST",
    headers: {
      "content-type": "text/plain;charset=UTF-8",
      accept: "text/x-component",
      "next-action": id,
      cookie: cookieHeader(),
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 600)}`);
  // Flight rows: `1:{"ok":...}`. Parse every row and take the action's value.
  for (const line of text.split("\n")) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    try {
      const value = JSON.parse(line.slice(colon + 1));
      if (value && typeof value === "object" && "ok" in value) return { value, text };
    } catch {
      // not a JSON row
    }
  }
  throw new Error(`No action result in: ${text.slice(0, 600)}`);
}

const basePayload = {
  title: MARKER,
  timeOption: "range",
  startAmPm: "",
  endAmPm: "",
  start: "2030-01-02 09:00:00",
  end: "2030-01-02 10:00:00",
  eventType: "",
  creatorId: session.user.id,
  inviteeUserIds: [staff.id],
  inviteeDepartments: [],
  registrationEnabled: false,
  registrationCap: null,
  ownerOnlyEdits: false,
  outOfCamp: false,
  overseas: false,
  pinned: false,
  pinnedDepartments: [],
  location: "",
};

const made = []; // { calendarId, googleEventId, eventId, ref, members }

function refFor(result, start, end, inviteeUserIds) {
  const copy = result.copies[0];
  return {
    calendarId: copy.calendarId,
    googleEventId: copy.googleEventId,
    eventId: result.eventId,
    start,
    end,
    allDay: false,
    creatorId: session.user.id,
    inviteeUserIds,
    inviteeDepartmentIds: [],
    ownerOnlyEdits: false,
    registrationEnabled: false,
  };
}

async function createWith(members, label, day = "2030-01-02") {
  const payload = {
    ...basePayload,
    start: `${day} 09:00:00`,
    end: `${day} 10:00:00`,
    inviteeUserIds: members.map((u) => u.id),
  };
  const t0 = performance.now();
  const { value } = await callAction(ids.create, [payload]);
  const ms = performance.now() - t0;
  if (!value.ok) throw new Error(`${label} failed: ${value.error}`);
  const ref = refFor(value, payload.start, payload.end, payload.inviteeUserIds);
  const entry = { ref, copies: value.copies, label };
  made.push(entry);
  console.log(
    `${label.padEnd(42)} ${ms.toFixed(0).padStart(5)} ms  copies=${value.copies.length}  event=${value.eventId.slice(0, 8)}`,
  );
  return { value, ms, payload, entry };
}

async function loadDashboard(month, date) {
  const res = await fetch(`${BASE}/api/dashboard/load`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cloudy2-api": "1",
      cookie: cookieHeader(),
    },
    body: JSON.stringify({ view: firstView?.id ?? null, month, date }),
  });
  const json = await res.json();
  return json?.record?.data ?? {};
}

// ---- run -----------------------------------------------------------------
try {
  // Warm-up (not counted): first action call pays the server's dynamic
  // `googleapis` import and the route compile.
  const warm = await createWith([staff], "warm-up (not counted)");
  await callAction(ids.remove, [warm.entry.ref]);
  warm.entry.deleted = true;
  made.length = 0;

  // Read-your-own-writes without an RSC revalidation: save an event in the
  // current month, then read the dashboard through its own data endpoint (the
  // exact path the client uses after a save).
  const sgNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const todayDay = sgNow.toISOString().slice(0, 10);
  const todayMonth = todayDay.slice(0, 7);
  if (firstView) {
    await callAction(ids.saveFilters, [
      firstView.id,
      { cal: null, users: null, types: null, text: null },
    ]);
  }
  const vis = await createWith([staff], "create — current month", todayDay);
  const afterCreate = await loadDashboard(todayMonth, todayDay);
  const appears = (afterCreate.events ?? []).some(
    (event) => event.payload?.eventId === vis.value.eventId,
  );
  console.log(
    `current-month create visible via /api/dashboard/load: ${appears ? "OK" : "MISSING"}`,
  );
  await callAction(ids.remove, [vis.entry.ref]);
  vis.entry.deleted = true;
  const afterDelete = await loadDashboard(todayMonth, todayDay);
  const stillThere = (afterDelete.events ?? []).some(
    (event) => event.payload?.eventId === vis.value.eventId,
  );
  console.log(
    `current-month delete absent via /api/dashboard/load: ${!stillThere ? "OK" : "STILL PRESENT"}\n`,
  );

  const one = await createWith([staff], "create — 1 department");
  const three = await createWith(invitees, `create — ${invitees.length} departments`);
  if (invitees.length >= 2) {
    console.log(
      `  per-copy ratio: 3-dept / 1-dept = ${(three.ms / one.ms).toFixed(2)}× ` +
        `(serial would be ~${invitees.length}×; concurrent is ~1×)\n`,
    );
  }

  // Update the multi-department event (same members → reconcile updates each copy).
  const updated = three.entry;
  const payload = {
    ...updated.ref,
    title: `${MARKER} (edited)`,
    timeOption: "range",
    startAmPm: "",
    endAmPm: "",
    start: updated.ref.start,
    end: updated.ref.end,
    eventType: "",
    inviteeUserIds: updated.ref.inviteeUserIds,
    inviteeDepartments: [],
    registrationEnabled: false,
    registrationCap: null,
    pinned: false,
    pinnedDepartments: [],
    outOfCamp: false,
    overseas: false,
    location: "",
  };
  let t0 = performance.now();
  const updateResult = await callAction(ids.update, [updated.ref, payload]);
  const updateMs = performance.now() - t0;
  if (!updateResult.value.ok) throw new Error(`update failed: ${updateResult.value.error}`);
  console.log(
    `update — ${updated.ref.inviteeUserIds.length} departments`.padEnd(42) +
      ` ${updateMs.toFixed(0).padStart(5)} ms  copies=${updateResult.value.copies.length}`,
  );

  // Delete every made event.
  for (const entry of made.filter((item) => !item.deleted)) {
    t0 = performance.now();
    const { value } = await callAction(ids.remove, [entry.ref]);
    const ms = performance.now() - t0;
    if (!value.ok) throw new Error(`delete failed: ${value.error}`);
    entry.deleted = true;
    console.log(
      `delete — ${entry.copies.length} copies`.padEnd(42) + ` ${ms.toFixed(0).padStart(5)} ms`,
    );
  }
} finally {
  if (firstView) {
    try {
      await callAction(ids.saveFilters, [
        firstView.id,
        {
          cal: firstView.cal_filter ?? null,
          users: firstView.users_filter ?? null,
          types: firstView.types_filter ?? null,
          text: firstView.text_filter ?? null,
        },
      ]);
      console.log("restored the view's original filters");
    } catch (error) {
      console.error("filter restore failed:", error.message);
    }
  }
  // Sweep any surviving probe events straight from Google so a failed action
  // never leaves dev-calendar clutter behind.
  const creds = env.GOOGLE_SERVICE_ACCOUNT_BASE64
    ? JSON.parse(Buffer.from(env.GOOGLE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8"))
    : { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: (env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n") };
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
  const calendar = google.calendar({ version: "v3", auth });
  const sql2 = postgres(env.DATABASE_URL, { max: 1 });
  const calendars = await sql2`select id, google_calendar_id from calendars`;
  await sql2.end({ timeout: 5 });
  let swept = 0;
  if (made.some((entry) => !entry.deleted)) {
    // A delete failed: sweep every department calendar for the marker so no
    // partial copy survives anywhere.
    for (const row of calendars) {
      try {
        const list = await calendar.events.list({
          calendarId: row.google_calendar_id,
          timeMin: "2030-01-01T00:00:00Z",
          timeMax: "2030-01-03T00:00:00Z",
          singleEvents: true,
        });
        for (const item of list.data.items ?? []) {
          if (item.summary?.startsWith(MARKER)) {
            await calendar.events.delete({
              calendarId: row.google_calendar_id,
              eventId: item.id,
            });
            swept += 1;
          }
        }
      } catch (error) {
        console.error(`cleanup failed for ${row.google_calendar_id}:`, error.message);
      }
    }
  }
  console.log(`\ncleanup: swept ${swept} surviving probe event(s)`);
}
