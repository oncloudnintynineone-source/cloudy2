import { readFileSync } from "node:fs";
import postgres from "postgres";

const env = readFileSync(".env.local", "utf8");
const line = env.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
const url = line.slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "");
const sql = postgres(url, { max: 1, connect_timeout: 15 });

const applied = await sql`SELECT id, hash FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 3`;
console.log("applied:", JSON.stringify(applied));

const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
const last = journal.entries[journal.entries.length - 1];
console.log("journal last:", JSON.stringify(last));

// Try the exact statements from 0075.
const mig = readFileSync("drizzle/0075_lovely_proudstar.sql", "utf8");
const parts = mig.split("--> statement-breakpoint");
console.log("parts:", parts.length);
try {
  await sql.begin(async (tx) => {
    for (const part of parts) {
      const stmt = part.trim();
      if (stmt) await tx.unsafe(stmt);
    }
  });
  console.log("statements OK (rolled back)");
  throw new Error("__rollback__");
} catch (e) {
  if (e.message !== "__rollback__") console.log("STATEMENT ERROR:", e.message);
}

const settings = await sql`SELECT metrics_snapshot_time FROM settings WHERE id='singleton'`;
console.log("current snapshot_time:", JSON.stringify(settings));
await sql.end();
