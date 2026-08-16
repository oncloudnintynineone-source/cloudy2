import { headers } from "next/headers";

import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { buildAuditLog, pathFromReferer, type AuditLogInput } from "./build";

/**
 * Records a state-changing action in `audit_logs`. Best-effort: any failure
 * (missing DB, network hiccup) is logged to the console and swallowed so it
 * can never break the primary action it is auditing.
 */
export async function logAction(input: AuditLogInput): Promise<void> {
  try {
    const requestHeaders = await headers();
    const refererPath = pathFromReferer(requestHeaders.get("referer"));
    const route = refererPath ?? input.route ?? null;

    const forwardedFor = requestHeaders.get("x-forwarded-for");
    const ip = forwardedFor?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || input.ip || null;

    await db.insert(auditLogs).values(buildAuditLog({ ...input, route, ip }));
  } catch (error) {
    console.error("[audit] Failed to write audit log", error);
  }
}
