/**
 * Dev-only seed script: creates departments, users, and department memberships
 * so the roster screens have data to render. Idempotent — safe to re-run.
 *
 * Usage: `pnpm db:seed` (reads DATABASE_URL from the environment or .env.local)
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";

import { db } from "./index";
import { departments, settings, userDepartments, users } from "./schema";

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

const departmentSeeds = [
  { name: "Operations", sortOrder: 1 },
  { name: "Planning", sortOrder: 2 },
  { name: "HR", sortOrder: 3 },
  { name: "Finance", sortOrder: 4 },
];

const userSeeds: {
  name: string;
  phone: string;
  email: string | null;
  birthday: string | null;
  role: "admin" | "user";
  status: "active" | "inactive";
  departments: string[];
}[] = [
  {
    name: "Alice Tan",
    phone: "81234567",
    email: "alice@cloudy.local",
    birthday: "1991-03-15",
    role: "admin",
    status: "active",
    departments: ["Operations"],
  },
  {
    name: "Bob Lim",
    phone: "82345678",
    email: "bob@cloudy.local",
    birthday: "1992-07-22",
    role: "user",
    status: "active",
    departments: ["Planning", "Operations"],
  },
  {
    name: "Carol Wong",
    phone: "83456789",
    email: "carol@cloudy.local",
    birthday: "1989-11-02",
    role: "user",
    status: "active",
    departments: ["HR"],
  },
  {
    name: "David Ng",
    phone: "84567890",
    email: null,
    birthday: null,
    role: "user",
    status: "inactive",
    departments: ["Finance"],
  },
];

async function seed() {
  loadEnvFile();

  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to seed in production.");
    process.exit(1);
  }

  let createdDepartments = 0;
  for (const dept of departmentSeeds) {
    const inserted = await db
      .insert(departments)
      .values(dept)
      .onConflictDoNothing()
      .returning({ id: departments.id });
    createdDepartments += inserted.length;
  }

  const deptByName = new Map((await db.select().from(departments)).map((d) => [d.name, d]));

  let createdUsers = 0;
  let createdMemberships = 0;
  for (const seed of userSeeds) {
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.phone, seed.phone))
      .limit(1);
    if (existing) {
      continue;
    }

    const [user] = await db
      .insert(users)
      .values({
        name: seed.name,
        phone: seed.phone,
        email: seed.email,
        birthday: seed.birthday,
        role: seed.role,
        status: seed.status,
      })
      .returning({ id: users.id });
    createdUsers += 1;

    const userDepts = seed.departments
      .map((name) => deptByName.get(name))
      .filter((d) => d !== undefined);

    if (userDepts.length > 0) {
      const inserted = await db
        .insert(userDepartments)
        .values(
          userDepts.map((d, index) => ({
            userId: user.id,
            departmentId: d.id,
            isPrimary: index === 0,
          })),
        )
        .onConflictDoNothing()
        .returning({ userId: userDepartments.userId });
      createdMemberships += inserted.length;
    }
  }

  const [settingsRow] = await db.select().from(settings).limit(1);
  if (settingsRow && !settingsRow.userKeyword) {
    await db.update(settings).set({ userKeyword: "leave" }).where(eq(settings.id, settingsRow.id));
    console.log("Set settings.userKeyword = 'leave' so seeded users can log in as [phone]leave");
  }

  console.log(`Seeded ${createdDepartments} departments, ${createdUsers} users, ${createdMemberships} memberships.`);
  console.log("Re-run anytime; existing rows are skipped.");
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
