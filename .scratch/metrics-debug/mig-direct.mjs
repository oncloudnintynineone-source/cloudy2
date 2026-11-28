import { readFileSync } from "node:fs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { readMigrationFiles } from "drizzle-orm/migrator";

const env = readFileSync(".env.local", "utf8");
const line = env.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
const url = line.slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "");
const client = postgres(url, { max: 1, connect_timeout: 15 });
const db = drizzle(client);

const migrations = readMigrationFiles({ migrationsFolder: "drizzle" });
const last = await client`SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1`;
console.log("last applied:", JSON.stringify(last));
const pending = migrations.filter(
  (m) => !last[0] || Number(last[0].created_at) < m.folderMillis,
);
console.log("pending count:", pending.length, "tags:", pending.map((m) => m.folderMillis));

try {
  await db.dialect.migrate(migrations, db.session, {
    migrationsFolder: "drizzle",
    migrationsTable: "__drizzle_migrations",
    migrationsSchema: "drizzle",
  });
  console.log("MIGRATE OK");
} catch (e) {
  console.log("MIGRATE ERROR:", e);
}
await client.end();
