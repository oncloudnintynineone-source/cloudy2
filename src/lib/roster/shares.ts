import { eq } from "drizzle-orm";

import { db } from "@/db";
import { calendars, users } from "@/db/schema";
import { getGoogleIntegration, googleCalendarConfigured } from "@/lib/google";
import { getAdminGoogleEmail, getServiceAccountConfig } from "@/lib/google/config";

export interface CalendarAccessRule {
  email: string;
  role: string;
}

export interface DepartmentAccess {
  /** Emails of users assigned to the department (auto-shared as readers). */
  assigned: string[];
  /** Extra ACL rules granted beyond assigned users. */
  additional: CalendarAccessRule[];
  /** The admin Google account granted owner access (non-removable). */
  admin: string | null;
  /** Present when Google is unavailable, so the UI can surface the cause. */
  syncWarning?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email);
}

/**
 * Emails that should be granted reader access but do not yet have an ACL rule.
 * Matching is case-insensitive; blank emails are ignored.
 */
export function diffAccess(
  existing: CalendarAccessRule[],
  expected: string[],
): string[] {
  const present = new Set(existing.map((rule) => rule.email.toLowerCase()));
  return expected.filter(
    (email) => email.trim() && !present.has(email.toLowerCase()),
  );
}

/**
 * Whether the admin account still needs an `owner` grant: no rule exists, or
 * its role is not `owner` (so a manual `reader` grant gets upgraded). Blank
 * emails never need a grant.
 */
export function needsAdminOwnerGrant(
  acls: CalendarAccessRule[],
  adminEmail: string,
): boolean {
  if (!adminEmail.trim()) {
    return false;
  }
  const rule = acls.find(
    (candidate) => candidate.email.toLowerCase() === adminEmail.toLowerCase(),
  );
  return !rule || rule.role !== "owner";
}

/**
 * Resolve a registry row (department id as used by the UI) to the Google
 * Calendar id it links to. Returns null when the department is missing.
 */
export async function resolveGoogleCalendarId(
  calendarId: string,
): Promise<string | null> {
  const [calendar] = await db
    .select({ googleCalendarId: calendars.googleCalendarId })
    .from(calendars)
    .where(eq(calendars.id, calendarId))
    .limit(1);
  return calendar?.googleCalendarId ?? null;
}

/**
 * Reconcile and read a department calendar's sharing. Assigned users with an
 * email are granted reader access (if missing); manual grants are preserved.
 * Google Calendar is the source of truth for ACLs — nothing is stored in the DB.
 */
export async function listDepartmentAccess(
  calendarId: string,
): Promise<DepartmentAccess> {
  const googleCalendarId = await resolveGoogleCalendarId(calendarId);
  const adminEmail = getAdminGoogleEmail();

  if (!googleCalendarId) {
    return {
      assigned: [],
      additional: [],
      admin: adminEmail || null,
      syncWarning: "Department not found",
    };
  }

  const assignedUsers = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.departmentId, calendarId));

  const assigned = Array.from(
    new Set(
      assignedUsers
        .map((user) => user.email?.trim())
        .filter((email): email is string => Boolean(email)),
    ),
  );

  if (!googleCalendarConfigured()) {
    return {
      assigned,
      additional: [],
      admin: adminEmail || null,
      syncWarning: "Google Calendar is not configured — sharing is unavailable",
    };
  }

  try {
    const integration = await getGoogleIntegration();
    let acls = await integration.listCalendarAccess(googleCalendarId);
    let aclChanged = false;

    if (adminEmail && needsAdminOwnerGrant(acls, adminEmail)) {
      try {
        await integration.setCalendarAccess(googleCalendarId, adminEmail, "owner");
        aclChanged = true;
      } catch {
        // Surface below via syncWarning; the rest of the sync continues.
      }
    }

    const missing = diffAccess(acls, assigned);
    const failed: string[] = [];
    for (const email of missing) {
      try {
        await integration.setCalendarAccess(googleCalendarId, email, "reader");
        aclChanged = true;
      } catch {
        failed.push(email);
      }
    }
    if (aclChanged) {
      acls = await integration.listCalendarAccess(googleCalendarId);
    }

    const assignedSet = new Set(assigned.map((email) => email.toLowerCase()));
    const serviceAccountEmail = getServiceAccountConfig()?.clientEmail;
    // The calendar resource id, the owning service account, and the admin
    // account are inherent owner rules — never expose them as removable shares.
    const isInherentOwner = (rule: CalendarAccessRule) =>
      rule.email === googleCalendarId ||
      (serviceAccountEmail != null && rule.email === serviceAccountEmail) ||
      (adminEmail !== "" && rule.email === adminEmail);
    const additional = acls.filter(
      (rule) => !assignedSet.has(rule.email.toLowerCase()) && !isInherentOwner(rule),
    );

    const warnings: string[] = [];
    if (adminEmail && !aclChanged && needsAdminOwnerGrant(acls, adminEmail)) {
      warnings.push("Could not grant admin owner access");
    }
    if (failed.length > 0) {
      warnings.push(`Could not share with: ${failed.join(", ")}`);
    }

    const result: DepartmentAccess = {
      assigned,
      additional,
      admin: adminEmail || null,
    };
    return warnings.length > 0 ? { ...result, syncWarning: warnings.join(" · ") } : result;
  } catch (error) {
    return {
      assigned,
      additional: [],
      admin: adminEmail || null,
      syncWarning:
        error instanceof Error ? error.message : "Could not sync calendar access",
    };
  }
}
