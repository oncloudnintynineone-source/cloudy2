import { readFileSync } from "node:fs";
import postgres from "postgres";

// Delete today's synthetic ledger rows + claim: the OLD deployed code closed
// 2026-11-28 mid-day, jumping the watermark over 11-27. Removing them lets the
// NEW code's lazy pass close 11-27 (yesterday) and leaves 11-28 to close
// tomorrow — the intended semantics. Dev monitoring data only.
const env = readFileSync(".env.local", "utf8");
const get = (k) =>
  env
    .split(/\r?\n/)
    .find((l) => l.startsWith(k + "="))
    ?.slice(k.length + 1)
    .trim()
    .replace(/^["']|["']$/g, "");
const sql = postgres(get("DATABASE_URL"), { max: 1, connect_timeout: 15 });

const days = await sql`DELETE FROM metrics_day WHERE day = '2026-11-28' RETURNING day, metric`;
console.log("deleted metrics_day rows:", days.length);
const claims = await sql`DELETE FROM metrics_claim WHERE day = '2026-11-28' RETURNING day, status`;
console.log("deleted claims:", JSON.stringify(claims));

const left = await sql`SELECT day, count(*) FROM metrics_day GROUP BY day ORDER BY day`;
console.log("metrics_day now:", JSON.stringify(left));
await sql.end();
