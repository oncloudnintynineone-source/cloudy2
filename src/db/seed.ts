/**
 * Dev-only seed script: creates calendars (the department registry) and users
 * assigned to a single department so the roster and departments screens have
 * data to render. Idempotent — safe to re-run.
 *
 * Usage: `pnpm db:seed` (reads DATABASE_URL from the environment or .env.local)
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";

import { db } from "./index";
import { calendars, settings, users } from "./schema";

function loadEnvFile(): void {
  if (process.env.DATABASE_URL) {
    return;
  }
  const envPath = join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    console.error("DATABASE_URL is not set and no .env.local was found.");
    process.exit(1);
  }
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }
    const [, key, value] = match;
    if (!(key in process.env)) {
      process.env[key] = value.trim().replace(/^["']|["']$/g, "");
    }
  }
}

const calendarSeeds = [
  { name: "Operations", googleCalendarId: "dept-operations@cloudy.local" },
  { name: "Planning", googleCalendarId: "dept-planning@cloudy.local" },
  { name: "HR", googleCalendarId: "dept-hr@cloudy.local" },
  { name: "Finance", googleCalendarId: "dept-finance@cloudy.local" },
];

const userSeeds: {
  name: string;
  phone: string;
  email: string | null;
  birthday: string | null;
  role: "admin" | "user";
  status: "active" | "inactive";
  departmentName: string | null;
}[] = [
  {
    name: "Alice Tan",
    phone: "81234567",
    email: "alice@cloudy.local",
    birthday: "1991-03-15",
    role: "admin",
    status: "active",
    departmentName: "Operations",
  },
  {
    name: "Bob Lim",
    phone: "82345678",
    email: "bob@cloudy.local",
    birthday: "1992-07-22",
    role: "user",
    status: "active",
    departmentName: "Planning",
  },
  {
    name: "Carol Wong",
    phone: "83456789",
    email: "carol@cloudy.local",
    birthday: "1989-11-02",
    role: "user",
    status: "active",
    departmentName: "HR",
  },
  {
    name: "David Ng",
    phone: "84567890",
    email: null,
    birthday: null,
    role: "user",
    status: "inactive",
    departmentName: null,
  },
];

async function seed() {
  loadEnvFile();

  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to seed in production.");
    process.exit(1);
  }

  let createdCalendars = 0;
  for (const cal of calendarSeeds) {
    const inserted = await db
      .insert(calendars)
      .values({ ...cal, kind: "department" })
      .onConflictDoNothing()
      .returning({ id: calendars.id });
    createdCalendars += inserted.length;
  }

  const calendarByName = new Map((await db.select().from(calendars)).map((c) => [c.name, c]));

  let createdUsers = 0;
  for (const seedUser of userSeeds) {
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.phone, seedUser.phone))
      .limit(1);
    if (existing) {
      continue;
    }

    const department = seedUser.departmentName
      ? calendarByName.get(seedUser.departmentName)
      : undefined;

    await db.insert(users).values({
      name: seedUser.name,
      phone: seedUser.phone,
      email: seedUser.email,
      birthday: seedUser.birthday,
      role: seedUser.role,
      status: seedUser.status,
      departmentId: department?.id ?? null,
    });
    createdUsers += 1;
  }

  const [settingsRow] = await db.select().from(settings).limit(1);
  if (settingsRow && !settingsRow.userKeyword) {
    await db.update(settings).set({ userKeyword: "leave" }).where(eq(settings.id, settingsRow.id));
    console.log("Set settings.userKeyword = 'leave' so seeded users can log in as [phone]leave");
  }

  console.log(`Seeded ${createdCalendars} calendars, ${createdUsers} users.`);
  console.log("Re-run anytime; existing rows are skipped.");
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
