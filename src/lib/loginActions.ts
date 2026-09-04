"use server";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { settings, users } from "@/db/schema";
import { parseUserLogin } from "@/lib/login";

export type LoginRoute =
  { kind: "admin"; phone: string } | { kind: "staff-candidate" } | { kind: "root-candidate" };

/**
 * Routing probe for the single-field login form. Tells the client which
 * NextAuth flow to run after a submit — the one case that needs a second step
 * is an admin-role user, who must present the shared admin PIN in a modal.
 *
 * This is a hint only and never an authority: `authorize` re-checks every
 * credential itself and is the only place sessions are issued or failures
 * audited. Because the probe never compares secrets it adds no timing oracle
 * beyond what authorize already performs.
 *
 * - input ends with the login keyword → `staff-candidate` (a regular user) or
 *   `admin` (an admin-role user, phone returned for the PIN step);
 * - otherwise the input cannot be a phone+keyword login → `root-candidate`
 *   (the phone-less emergency admin / any input authorize must reject).
 */
export async function resolveLogin(input: string): Promise<LoginRoute> {
  const trimmed = typeof input === "string" ? input.trim() : "";
  if (!trimmed) {
    return { kind: "root-candidate" };
  }

  const [settingsRow] = await db.select().from(settings).limit(1);
  const keyword = settingsRow?.userKeyword ?? "";
  if (!keyword || !trimmed.endsWith(keyword)) {
    return { kind: "root-candidate" };
  }

  const phone = parseUserLogin(trimmed, keyword);
  if (!phone) {
    return { kind: "root-candidate" };
  }

  const [user] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(and(eq(users.phone, phone), eq(users.status, "active")))
    .limit(1);

  if (user?.role === "admin") {
    return { kind: "admin", phone };
  }
  return { kind: "staff-candidate" };
}
