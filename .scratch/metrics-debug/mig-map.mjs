import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";

const env = readFileSync(".env.local", "utf8");
const line = env.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
const url = line.slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "");
const sql = postgres(url, { max: 1, connect_timeout: 15 });

const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
const rows = await sql`SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
const byHash = new Map(rows.map((r) => [r.hash, r]));

for (const e of journal.entries.slice(-6)) {
  const file = `drizzle/${e.tag}.sql`;
  const hash = createHash("sha256").update(readFileSync(file).toString()).digest("hex");
  const row = byHash.get(hash);
  console.log(
    `idx ${e.idx} ${e.tag} when=${e.when} fileHash=${hash.slice(0, 12)} recorded=${
      row ? `id=${row.id} created_at=${row.created_at}` : "NOT RECORDED"
    }`
  );
}
console.log("--- recorded rows ---");
for (const r of rows) console.log(`id=${r.id} created_at=${r.created_at} hash=${r.hash.slice(0, 12)}`);
await sql.end();
