#!/usr/bin/env node
/**
 * Transactional check (rolled back) that the one-statement invalidation CTE
 * actually bumps the epoch and deletes cache rows for the given key. Read-only
 * in effect: everything is rolled back.
 */
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
const [before] = await sql`select epoch from cache_invalidation where id = 'singleton'`;
let inside;
try {
  await sql.begin(async (tx) => {
    await tx`insert into cache_invalidation (id, epoch) values ('singleton', 0) on conflict do nothing`;
    await tx`insert into google_event_cache (calendar_google_id, month, events, fetched_at)
             values ('__probe__', '1999-01', '[]'::jsonb, now())`;
    await tx`with bumped as (
               update cache_invalidation set epoch = epoch + 1, updated_at = now()
               where id = 'singleton'
             )
             delete from google_event_cache
             where calendar_google_id in ('__probe__') and month in ('1999-01')`;
    const [row] = await tx`select epoch from cache_invalidation where id = 'singleton'`;
    const [gone] = await tx`select count(*)::int as n from google_event_cache
                            where calendar_google_id = '__probe__'`;
    inside = { epoch: row.epoch, remaining: gone.n };
    throw new Error("rollback");
  });
} catch (error) {
  if (error.message !== "rollback") throw error;
}
const [after] = await sql`select epoch from cache_invalidation where id = 'singleton'`;
const [leftover] = await sql`select count(*)::int as n from google_event_cache
                            where calendar_google_id = '__probe__'`;
await sql.end({ timeout: 5 });
console.log(
  `before=${before?.epoch ?? 0} inside=${inside?.epoch} remaining-inside=${inside?.remaining} ` +
    `after-rollback=${after?.epoch ?? 0} leftover=${leftover.n}`,
);
if (
  Number(inside.epoch) !== Number(before?.epoch ?? 0) + 1 ||
  Number(inside.remaining) !== 0 ||
  Number(leftover.n) !== 0
) {
  console.error("CTE check failed", { before, inside, leftover });
  process.exit(1);
}
console.log("one-statement invalidation CTE OK (bumps epoch and deletes the rows)");
