#!/usr/bin/env node
/** Read-only guard: no responsiveness-probe events may remain on dev Google. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { google } from "googleapis";
import postgres from "postgres";

const here = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const line of readFileSync(join(here, "..", "..", ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}
const creds = env.GOOGLE_SERVICE_ACCOUNT_BASE64
  ? JSON.parse(Buffer.from(env.GOOGLE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8"))
  : { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: (env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n") };
const auth = new google.auth.JWT({
  email: creds.client_email,
  key: creds.private_key,
  scopes: ["https://www.googleapis.com/auth/calendar"],
});
const calendar = google.calendar({ version: "v3", auth });
const sql = postgres(env.DATABASE_URL, { max: 1 });
const calendars = await sql`select google_calendar_id from calendars`;
await sql.end({ timeout: 5 });

let leftovers = 0;
for (const row of calendars) {
  const res = await calendar.events.list({
    calendarId: row.google_calendar_id,
    timeMin: "2030-01-01T00:00:00Z",
    timeMax: "2030-01-03T00:00:00Z",
    singleEvents: true,
  });
  for (const item of res.data.items ?? []) {
    if (item.summary?.startsWith("cloudy2 responsiveness probe")) {
      leftovers += 1;
      console.log(`LEFT OVER: ${row.google_calendar_id} ${item.id} ${item.summary}`);
    }
  }
}
console.log(`probe events remaining: ${leftovers}`);
process.exit(leftovers === 0 ? 0 : 1);
