/**
 * The activity set writer — the only thing the ledger records on the request
 * path, and the source of the compute estimate.
 *
 * Neon bills compute as wall-clock time the endpoint is awake, and the API that
 * reports it is paid-plan only. What the app *can* know is the minute it last
 * touched the database, and from a dense-enough series of those minutes the
 * rest follows: a gap longer than Neon's fixed 5-minute suspend timeout means
 * the endpoint slept and was woken again.
 *
 * So this writes one minute index, at most once per minute per instance, and
 * always inside `after()` — a request never waits on it. The merge is a set
 * union in SQL, which is what lets up to four Cloud Run instances write the
 * same day concurrently without either losing minutes or double-counting them.
 */

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { metricsActivity } from "@/db/schema";
import { formatInstantToNaive } from "@/lib/events/datetime";

/** `"YYYY-MM-DD HH:mm"` of the last minute this instance wrote. */
let lastWrittenMinute: string | null = null;

/**
 * Record that this instance touched the database during the current UTC+8
 * minute. Best-effort: any failure is swallowed, because a metrics write that
 * can break a dashboard read is worse than a missing minute.
 */
export async function recordActivityMinute(now: Date = new Date()): Promise<void> {
  const naive = formatInstantToNaive(now);
  const day = naive.slice(0, 10);
  const minuteKey = naive.slice(0, 16);
  if (minuteKey === lastWrittenMinute) {
    return;
  }
  // Marked before the write on purpose: a failing write must not turn every
  // subsequent request into another attempt.
  lastWrittenMinute = minuteKey;

  const [hours, minutes] = naive.slice(11, 16).split(":").map(Number);
  const minute = hours * 60 + minutes;

  try {
    await db
      .insert(metricsActivity)
      .values({ day, minutes: [minute] })
      .onConflictDoUpdate({
        target: metricsActivity.day,
        set: {
          // Set union, de-duplicated and ascending. `array_agg(DISTINCT …)`
          // keeps the stored array canonical, so the snapshot's count is just
          // its length and two instances converge on the same value.
          minutes: sql`(
            SELECT array_agg(DISTINCT m ORDER BY m)
            FROM unnest(${metricsActivity.minutes} || excluded.minutes) AS merged (m)
          )`,
          updatedAt: new Date(),
        },
      });
  } catch (error) {
    console.error("[metrics] activity minute write failed", error);
  }
}

/** Reset the per-instance throttle. Test seam only. */
export function resetActivityThrottleForTests(): void {
  lastWrittenMinute = null;
}
