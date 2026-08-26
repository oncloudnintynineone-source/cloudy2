import { eq } from "drizzle-orm";

import { db } from "@/db";
import { calendars, users } from "@/db/schema";
import { getGoogleIntegration, googleCalendarConfigured } from "@/lib/google";
import { getAdminGoogleEmail, getServiceAccountConfig } from "@/lib/google/config";

/** Access levels offered for a department's additional access rules. */
export type DepartmentAccessRole = "reader" | "writer" | "owner";

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

/** True when the value is one of the selectable additional-access roles. */
export function isDepartmentAccessRole(value: unknown): value is DepartmentAccessRole {
  return value === "reader" || value === "writer" || value === "owner";
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
 * Emails whose ACL rule should be revoked: candidates that no assigned user
 * holds anymore (e.g. a user's previous email after it changed). Matching is
 * case-insensitive; blank emails are ignored.
 */
export function diffRevocable(candidates: string[], assigned: string[]): string[] {
  const present = new Set(assigned.map((email) => email.toLowerCase()));
  return candidates.filter(
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
 * Whether an email is an inherent owner of a department calendar and must
 * never be revoked or surfaced as a removable share: the calendar resource
 * itself, the owning service account, or the configured admin account.
 */
export function isInherentOwnerEmail(
  email: string,
  googleCalendarId: string,
  serviceAccountEmail: string | null,
  adminEmail: string,
): boolean {
  return (
    email === googleCalendarId ||
    (serviceAccountEmail != null && email === serviceAccountEmail) ||
    (adminEmail !== "" && email === adminEmail)
  );
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
    const serviceAccountEmail = getServiceAccountConfig()?.clientEmail ?? null;
    // The calendar resource id, the owning service account, and the admin
    // account are inherent owner rules — never expose them as removable shares.
    const isInherentOwner = (rule: CalendarAccessRule) =>
      isInherentOwnerEmail(rule.email, googleCalendarId, serviceAccountEmail, adminEmail);
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

/** The parts of a user row that affect their department calendars' sharing. */
export interface UserAccessChange {
  /** The user's email before the change (null when there was none). */
  oldEmail: string | null;
  /** The user's email after the change (null when it was cleared). */
  newEmail: string | null;
  /** The user's department before the change (null when unassigned). */
  oldDepartmentId: string | null;
  /** The user's department after the change (null when unassigned). */
  newDepartmentId: string | null;
}

/**
 * Reconcile Google Calendar ACLs after a user's email or department changed.
 * For each affected department calendar:
 * - grant reader access to every assigned user's email missing a rule (this
 *   covers the new email, and the user's email after a department move);
 * - revoke the ACL rule for the email the user gave up in the department they
 *   left (their previous email, or their unchanged email in the old
 *   department) — but only when no assigned user holds that email anymore,
 *   and never for an inherent owner.
 * Google Calendar remains the source of truth for ACLs. Returns human-readable
 * warnings for operations that failed; Google unconfigured short-circuits to
 * no warnings (there is nothing to reconcile).
 */
export async function reconcileUserAccessChange(
  change: UserAccessChange,
): Promise<string[]> {
  const warnings: string[] = [];
  if (!googleCalendarConfigured()) {
    return warnings;
  }

  const departmentIds = new Set<string>();
  if (change.oldDepartmentId) {
    departmentIds.add(change.oldDepartmentId);
  }
  if (change.newDepartmentId) {
    departmentIds.add(change.newDepartmentId);
  }

  for (const departmentId of departmentIds) {
    const googleCalendarId = await resolveGoogleCalendarId(departmentId);
    if (!googleCalendarId) {
      continue;
    }

    const assignedUsers = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.departmentId, departmentId));
    const assigned = Array.from(
      new Set(
        assignedUsers
          .map((user) => user.email?.trim())
          .filter((email): email is string => Boolean(email)),
      ),
    );

    // The email the user gave up in this department: the previous email when
    // this is the department they are leaving (email change or department move).
    const givenUp =
      departmentId === change.oldDepartmentId ? change.oldEmail?.trim() ?? null : null;

    try {
      const integration = await getGoogleIntegration();
      const acls = await integration.listCalendarAccess(googleCalendarId);

      const failed: string[] = [];
      for (const email of diffAccess(acls, assigned)) {
        try {
          await integration.setCalendarAccess(googleCalendarId, email, "reader");
        } catch {
          failed.push(email);
        }
      }

      const serviceAccountEmail = getServiceAccountConfig()?.clientEmail ?? null;
      const adminEmail = getAdminGoogleEmail();
      for (const email of diffRevocable(givenUp ? [givenUp] : [], assigned)) {
        if (isInherentOwnerEmail(email, googleCalendarId, serviceAccountEmail, adminEmail)) {
          continue;
        }
        try {
          await integration.removeCalendarAccess(googleCalendarId, email);
        } catch {
          failed.push(email);
        }
      }

      if (failed.length > 0) {
        warnings.push(`Could not sync calendar access for: ${failed.join(", ")}`);
      }
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "Could not sync calendar access");
    }
  }

  return warnings;
}
