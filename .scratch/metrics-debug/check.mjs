// Read-only diagnostic for the Resource Usage ledger (dev DB).
import { readFileSync } from "node:fs";
import postgres from "postgres";

const env = readFileSync(".env.local", "utf8");
const line = env.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
if (!line) throw new Error("DATABASE_URL not found in .env.local");
const url = line.slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "");

const sql = postgres(url, { max: 1, connect_timeout: 15 });
const q = async (label, text) => {
  try {
    const rows = await sql.unsafe(text);
    console.log(`\n=== ${label} ===`);
    console.table(rows.slice(0, 20));
    if (rows.length > 20) console.log(`(${rows.length} rows total)`);
  } catch (err) {
    console.log(`\n=== ${label} === ERROR: ${err.message}`);
  }
};

await q("settings (metrics config)", `
  SELECT metrics_enabled, metrics_snapshot_time, metrics_snapshot_days,
         metrics_neon_cap_compute_hours, metrics_retention_days,
         metrics_egress_calibration
  FROM settings WHERE id = 'singleton'`);

await q("metrics_day: rows per day", `
  SELECT day, count(*) AS rows, count(DISTINCT metric) AS metrics
  FROM metrics_day GROUP BY day ORDER BY day DESC LIMIT 15`);

await q("metrics_day: key budget metrics (latest 10 days)", `
  SELECT day, metric, label_key, value FROM metrics_day
  WHERE metric IN ('storage.db_bytes','compute.active_minutes','app.egress_bytes','app.requests')
  ORDER BY day DESC, metric LIMIT 30`);

await q("metrics_claim (snapshot)", `
  SELECT kind, day, status, claimed_at, finished_at, attempts, instance, error
  FROM metrics_claim ORDER BY day DESC LIMIT 10`);

await q("metrics_activity (recent days)", `
  SELECT day, coalesce(array_length(minutes,1),0) AS minutes_written, updated_at
  FROM metrics_activity ORDER BY day DESC LIMIT 10`);

await q("metrics_running (recent)", `
  SELECT day, metric, label_key, value FROM metrics_running
  ORDER BY day DESC, metric LIMIT 20`);

await q("audit: metrics.snapshot rows", `
  SELECT created_at, action, actor_role, entity_name, details
  FROM audit_logs WHERE action = 'metrics.snapshot'
  ORDER BY created_at DESC LIMIT 10`);

await q("audit: any metrics.* rows", `
  SELECT created_at, action, method, details FROM audit_logs
  WHERE action LIKE 'metrics%' ORDER BY created_at DESC LIMIT 10`);

await q("pg_stat_statements installed?", `
  SELECT count(*) AS ext FROM pg_extension WHERE extname = 'pg_stat_statements'`);

await q("drizzle migrations applied (last 5)", `
  SELECT id, hash, created_at FROM drizzle.__drizzle_migrations
  ORDER BY id DESC LIMIT 5`);

await sql.end();
