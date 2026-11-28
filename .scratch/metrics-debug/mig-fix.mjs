import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";

const env = readFileSync(".env.local", "utf8");
const line = env.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
const url = line.slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "");
const sql = postgres(url, { max: 1, connect_timeout: 15 });

// 1. Verify every object 0074 creates is present before claiming it applied.
const tables = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('metrics_activity','metrics_claim','metrics_day','metrics_running')
`;
const cols = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'settings'
    AND column_name IN ('metrics_enabled','metrics_snapshot_time','metrics_snapshot_days',
      'metrics_neon_cap_compute_hours','metrics_neon_cap_egress_bytes',
      'metrics_neon_cap_storage_bytes','metrics_egress_calibration','metrics_retention_days')
`;
const idx = await sql`
  SELECT indexname FROM pg_indexes WHERE schemaname='public'
    AND indexname IN ('metrics_claim_claimed_idx','metrics_day_day_metric_idx')
`;
console.log("tables:", tables.length, "/4  cols:", cols.length, "/8  idx:", idx.length, "/2");
if (tables.length !== 4 || cols.length !== 8 || idx.length !== 2) {
  console.log("MISSING OBJECTS — aborting, 0074 not fully applied");
  await sql.end();
  process.exit(1);
}

// 2. Insert the missing 0074 bookkeeping row (hash = sha256 of the file as the
//    migrator reads it; created_at = journal `when`). Idempotent guard first.
const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
const e74 = journal.entries.find((e) => e.idx === 74);
const hash = createHash("sha256").update(readFileSync(`drizzle/${e74.tag}.sql`).toString()).digest("hex");
const existing = await sql`SELECT id FROM drizzle.__drizzle_migrations WHERE created_at = ${String(e74.when)}`;
if (existing.length === 0) {
  await sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${hash}, ${String(e74.when)})`;
  console.log("inserted 0074 bookkeeping row, hash", hash.slice(0, 12));
} else {
  console.log("0074 row already present, id", existing[0].id);
}

const after = await sql`SELECT id, created_at, left(hash,12) AS hash FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 2`;
console.log("top rows:", JSON.stringify(after));
await sql.end();
