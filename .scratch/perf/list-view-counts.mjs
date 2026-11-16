import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const here = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const line of readFileSync(join(here, "..", "..", ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}
const sql = postgres(env.DATABASE_URL, { max: 1 });
const rows = await sql`
  select u.id, u.name, u.phone, count(v.id)::int as views
  from users u left join user_dashboard_views v on v.user_id = u.id
  where u.role = 'user' and u.status = 'active' and u.phone is not null
  group by u.id, u.name, u.phone order by views desc, u.created_at limit 8`;
console.log(rows);
await sql.end({ timeout: 5 });
