"use server";

import { addOneDay, formatInstantToNaive, parseNaiveToInstant } from "@/lib/events/datetime";
import { computeKahBreaches } from "@/lib/kah/check";
import { busyKahsIn, kahGroupsForUser, listKahGroupChecks } from "@/lib/kah/status";
import { requireSession } from "@/lib/session";

export type KahBreachCountResult = { ok: true; count: number } | { ok: false; error: string };

/**
 * The KAH Status nav badge count: how many of the viewer's groups are breaching
 * **today** (the "active" breaches). Admins count every group, matching the
 * groups their `/kah-status` page lists; members count only their own. A
 * read-only scan over the cached month reads — never writes or audits.
 */
export async function checkKahBreaches(): Promise<KahBreachCountResult> {
  const session = await requireSession();
  try {
    const isAdmin = session.user.role === "admin";
    const groups = isAdmin
      ? await listKahGroupChecks()
      : await kahGroupsForUser(session.user.id);
    if (groups.length === 0) {
      return { ok: true, count: 0 };
    }

    const today = formatInstantToNaive(new Date()).slice(0, 10);
    const busy = await busyKahsIn(
      parseNaiveToInstant(`${today} 00:00:00`),
      parseNaiveToInstant(`${addOneDay(today)} 00:00:00`),
    );
    return { ok: true, count: computeKahBreaches(groups, busy).length };
  } catch (error) {
    console.error("[kah] Breach count failed", error);
    return { ok: false, error: "Could not check KAH breaches" };
  }
}
