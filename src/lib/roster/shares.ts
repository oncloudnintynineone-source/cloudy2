import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { calendars, userCalendarAccess, users } from "@/db/schema";
import { getGoogleIntegration, googleCalendarConfigured } from "@/lib/google";
import { getAdminGoogleEmail, getServiceAccountConfig } from "@/lib/google/config";

/** Access levels offered for a department's additional access rules. */
export type DepartmentAccessRole = "reader" | "writer" | "owner";

/** The managed levels a cross-department grant row may carry. */
export type ManagedGrantRole = DepartmentAccessRole;

export interface CalendarAccessRule {
  email: string;
  role: string;
}

/** A cross-department access grant: a roster user + a department calendar + role. */
export interface UserCalendarGrant {
  calendarId: string;
  role: ManagedGrantRole;
}

/** A cross-department-granted user rendered in a department's Calendar access. */
export interface GrantedAccessUser {
  /** The user's email — the address the Google ACL rule is keyed on. */
  email: string;
  name: string;
  /** The user's own department's display name (null when unassigned). */
  departmentName: string | null;
  /** The live Google ACL role (falls back to the granted role off-Google). */
  role: string;
}

export interface DepartmentAccess {
  /** Emails of users assigned to the department (auto-shared as readers). */
  assigned: string[];
  /**
   * Each assigned email's current Google ACL role (keyed by the exact
   * assigned email), so the UI can show — and the admin can override — an
   * elevated role the user holds. Empty when Google is unavailable.
   */
  assignedRoles: Record<string, string>;
  /**
   * Users granted this calendar from their own user settings (cross-department
   * access). Unlike `assigned` (the department's own members) these users are
   * managed from Users → the user's "Department access" section, not here.
   */
  granted: GrantedAccessUser[];
  /** Extra ACL rules granted beyond assigned users and granted users. */
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

/** True when the value is one of the managed cross-department grant roles. */
export function isManagedGrantRole(value: unknown): value is ManagedGrantRole {
  return value === "reader" || value === "writer" || value === "owner";
}

/** Coerce an ACL/raw role to a managed grant role (owner/writer kept, else the reader default). */
export function normalizeGrantRole(value: string | null | undefined): ManagedGrantRole {
  if (value === "writer" || value === "owner") {
    return value;
  }
  return "reader";
}

/** Relative rank used to compare ACL roles (readers may be upgraded, never downgraded). */
const ROLE_RANK: Record<string, number> = { reader: 0, writer: 1, owner: 2 };

/**
 * True when a rule is missing or sits below the intended managed role, i.e. it
 * needs to be (re)granted. A rule already at or above the intended role is left
 * alone — an admin-elevated override (writer/owner set from the department
 * modal) always survives a reconcile.
 */
export function needsManagedGrant(
  ruleRole: string | null | undefined,
  intendedRole: ManagedGrantRole,
): boolean {
  if (!ruleRole) {
    return true;
  }
  return (ROLE_RANK[ruleRole] ?? -1) < ROLE_RANK[intendedRole];
}

/** A raw access-list entry before normalization (client value). */
export interface RawAccessGrant {
  calendarId?: unknown;
  role?: unknown;
}

/**
 * Coerce a client-submitted access selection into clean managed grants: only
 * reader/writer/owner roles survive, the user's own department is never granted
 * (its access is implied by membership), and duplicate calendar ids collapse. Pure.
 */
export function normalizeAccessSelection(
  raw: unknown,
  ownDepartmentId: string | null | undefined,
): UserCalendarGrant[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<string>();
  const grants: UserCalendarGrant[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const { calendarId, role } = entry as RawAccessGrant;
    if (typeof calendarId !== "string" || !calendarId.trim()) {
      continue;
    }
    if (ownDepartmentId && calendarId === ownDepartmentId) {
      continue;
    }
    const key = calendarId.trim();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    grants.push({ calendarId: key, role: isManagedGrantRole(role) ? role : "reader" });
  }
  return grants;
}

const MANAGED_ROLE_LABELS: Record<ManagedGrantRole, string> = {
  reader: "Read only",
  writer: "Can edit",
  owner: "Owner",
};

/**
 * Human-readable, department-name-sorted entries for audit payloads, e.g.
 * `["Operations (Can edit)"]`. Names come from a `calendarId → name` map.
 */
export function formatManagedGrants(
  grants: UserCalendarGrant[],
  names: Record<string, string>,
): string[] {
  return [...grants]
    .sort((a, b) =>
      (names[a.calendarId] ?? a.calendarId).localeCompare(names[b.calendarId] ?? b.calendarId),
    )
    .map(
      (grant) =>
        `${names[grant.calendarId] ?? grant.calendarId} (${MANAGED_ROLE_LABELS[grant.role]})`,
    );
}

/**
 * Emails that should be granted reader access but do not yet have an ACL rule.
 * Matching is case-insensitive; blank emails are ignored.
 */
export function diffAccess(existing: CalendarAccessRule[], expected: string[]): string[] {
  const present = new Set(existing.map((rule) => rule.email.toLowerCase()));
  return expected.filter((email) => email.trim() && !present.has(email.toLowerCase()));
}

/**
 * Emails whose ACL rule should be revoked: candidates that no assigned user
 * holds anymore (e.g. a user's previous email after it changed). Matching is
 * case-insensitive; blank emails are ignored.
 */
export function diffRevocable(candidates: string[], assigned: string[]): string[] {
  const present = new Set(assigned.map((email) => email.toLowerCase()));
  return candidates.filter((email) => email.trim() && !present.has(email.toLowerCase()));
}

/**
 * Whether the admin account still needs an `owner` grant: no rule exists, or
 * its role is not `owner` (so a manual `reader` grant gets upgraded). Blank
 * emails never need a grant.
 */
export function needsAdminOwnerGrant(acls: CalendarAccessRule[], adminEmail: string): boolean {
  if (!adminEmail.trim()) {
    return false;
  }
  const rule = acls.find((candidate) => candidate.email.toLowerCase() === adminEmail.toLowerCase());
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
export async function resolveGoogleCalendarId(calendarId: string): Promise<string | null> {
  const [calendar] = await db
    .select({ googleCalendarId: calendars.googleCalendarId })
    .from(calendars)
    .where(eq(calendars.id, calendarId))
    .limit(1);
  return calendar?.googleCalendarId ?? null;
}

/**
 * Resolve several registry rows (department ids) to their Google Calendar ids
 * in one query, keyed by registry id. Unknown ids are omitted (callers fall
 * back to null, same as {@link resolveGoogleCalendarId}).
 */
export async function resolveGoogleCalendarIds(
  calendarIds: string[],
): Promise<Record<string, string>> {
  const uniqueIds = [...new Set(calendarIds)];
  if (uniqueIds.length === 0) {
    return {};
  }
  const rows = await db
    .select({ id: calendars.id, googleCalendarId: calendars.googleCalendarId })
    .from(calendars)
    .where(inArray(calendars.id, uniqueIds));
  return Object.fromEntries(rows.map((row) => [row.id, row.googleCalendarId]));
}

/** One managed (DB-derived) expectation of who should hold an ACL rule. */
export interface AccessExpectation {
  /** The exact email to grant. */
  email: string;
  role: ManagedGrantRole;
  /** Where the expectation comes from: the user's own department or a grant row. */
  source: "member" | "grant";
}

/**
 * The managed expectations for one department calendar: every member's email
 * (auto reader) plus every cross-department grant row's email (at its row
 * role). A redundant grant row on a member's own calendar overrides reader.
 * Users without an email never produce an expectation.
 */
async function accessExpectationsForCalendar(calendarId: string): Promise<AccessExpectation[]> {
  const [members, grantRows] = await Promise.all([
    db.select({ email: users.email }).from(users).where(eq(users.departmentId, calendarId)),
    db.select().from(userCalendarAccess).where(eq(userCalendarAccess.calendarId, calendarId)),
  ]);

  const byEmail = new Map<string, AccessExpectation>();
  for (const member of members) {
    const email = member.email?.trim();
    if (!email) {
      continue;
    }
    byEmail.set(email.toLowerCase(), { email, role: "reader", source: "member" });
  }

  if (grantRows.length > 0) {
    const userIds = [...new Set(grantRows.map((row) => row.userId))];
    const userRows = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(inArray(users.id, userIds));
    const emailById = new Map(
      userRows.filter((row) => row.email?.trim()).map((row) => [row.id, row.email!.trim()]),
    );
    for (const row of grantRows) {
      const email = emailById.get(row.userId);
      if (!email) {
        continue;
      }
      byEmail.set(email.toLowerCase(), { email, role: row.role, source: "grant" });
    }
  }

  return [...byEmail.values()];
}

/**
 * The granted (cross-department) users of one department calendar, for display
 * in the department detail modal: email, name, their own department's name, and
 * the granted role. Redundant rows on the user's own calendar are excluded.
 */
async function grantedAccessUsersForCalendar(calendarId: string): Promise<GrantedAccessUser[]> {
  const rows = await db
    .select({
      role: userCalendarAccess.role,
      email: users.email,
      name: users.name,
      departmentId: users.departmentId,
    })
    .from(userCalendarAccess)
    .leftJoin(users, eq(userCalendarAccess.userId, users.id))
    .where(eq(userCalendarAccess.calendarId, calendarId));

  const departmentIds = [
    ...new Set(rows.map((row) => row.departmentId).filter(Boolean)),
  ] as string[];
  let departmentNames: Record<string, string> = {};
  if (departmentIds.length > 0) {
    const departments = await db
      .select({ id: calendars.id, name: calendars.name })
      .from(calendars)
      .where(inArray(calendars.id, departmentIds));
    departmentNames = Object.fromEntries(departments.map((row) => [row.id, row.name]));
  }

  return rows
    .filter((row) => row.email?.trim() && row.departmentId !== calendarId)
    .map((row) => ({
      email: row.email!.trim(),
      name: row.name ?? "",
      departmentName: row.departmentId ? (departmentNames[row.departmentId] ?? null) : null,
      role: row.role,
    }))
    .sort((a, b) =>
      `${a.departmentName ?? ""}\u0000${a.name}`.localeCompare(
        `${b.departmentName ?? ""}\u0000${b.name}`,
      ),
    );
}

/**
 * Bring a department calendar's ACLs in line with a set of expectations:
 * - revoke every candidate email that no expectation (and no inherent owner)
 *   still needs — skipped when the candidate is expected or has no rule;
 * - grant every expectation missing a rule, upgrading a rule below its role
 *   (never downgrading an elevated one);
 * - optionally ensure the admin account holds `owner`.
 * Google Calendar remains the source of truth for ACLs. Returns the final ACLs
 * (re-read only when something changed) and the emails that failed to sync.
 */
async function reconcileCalendarToExpectations(
  googleCalendarId: string,
  expectations: AccessExpectation[],
  revokeCandidates: string[] = [],
  ensureAdminOwner = false,
): Promise<{ acls: CalendarAccessRule[]; failed: string[] }> {
  const integration = await getGoogleIntegration();
  let acls = await integration.listCalendarAccess(googleCalendarId);
  let changed = false;
  const failed: string[] = [];
  const serviceAccountEmail = getServiceAccountConfig()?.clientEmail ?? null;
  const adminEmail = getAdminGoogleEmail();

  if (ensureAdminOwner && adminEmail && needsAdminOwnerGrant(acls, adminEmail)) {
    try {
      await integration.setCalendarAccess(googleCalendarId, adminEmail, "owner");
      changed = true;
    } catch {
      failed.push("admin");
    }
  }

  const expectedEmails = new Set(expectations.map((item) => item.email.toLowerCase()));
  for (const candidate of revokeCandidates) {
    const lower = candidate.toLowerCase();
    if (!lower || expectedEmails.has(lower)) {
      continue;
    }
    const rule = acls.find((item) => item.email.toLowerCase() === lower);
    if (
      !rule ||
      isInherentOwnerEmail(rule.email, googleCalendarId, serviceAccountEmail, adminEmail)
    ) {
      continue;
    }
    try {
      await integration.removeCalendarAccess(googleCalendarId, rule.email);
      changed = true;
    } catch {
      failed.push(candidate);
    }
  }

  for (const { email, role } of expectations) {
    const rule = acls.find((item) => item.email.toLowerCase() === email.toLowerCase());
    if (rule && !needsManagedGrant(rule.role, role)) {
      continue;
    }
    try {
      await integration.setCalendarAccess(googleCalendarId, email, role);
      changed = true;
    } catch {
      failed.push(email);
    }
  }

  if (changed) {
    acls = await integration.listCalendarAccess(googleCalendarId);
  }
  return { acls, failed };
}

/**
 * Reconcile and read a department calendar's sharing. Assigned users and
 * cross-department-granted users are granted at their managed roles (if
 * missing); the admin is granted owner; manual grants are preserved. Google
 * Calendar is the source of truth for ACLs — the rows merely record intent.
 */
export async function listDepartmentAccess(calendarId: string): Promise<DepartmentAccess> {
  const [calendar] = await db.select().from(calendars).where(eq(calendars.id, calendarId)).limit(1);
  const adminEmail = getAdminGoogleEmail();

  if (!calendar) {
    return {
      assigned: [],
      assignedRoles: {},
      granted: [],
      additional: [],
      admin: adminEmail || null,
      syncWarning: "Department not found",
    };
  }

  const expectations = await accessExpectationsForCalendar(calendarId);
  const memberEmails = expectations
    .filter((item) => item.source === "member")
    .map((item) => item.email);
  const assigned = Array.from(new Set(memberEmails));
  const grantedUsers = await grantedAccessUsersForCalendar(calendarId);

  if (!googleCalendarConfigured()) {
    return {
      assigned,
      assignedRoles: {},
      granted: grantedUsers,
      additional: [],
      admin: adminEmail || null,
      syncWarning: "Google Calendar is not configured — sharing is unavailable",
    };
  }

  try {
    const { acls, failed } = await reconcileCalendarToExpectations(
      calendar.googleCalendarId,
      expectations,
      [],
      true,
    );
    const managedEmails = new Set(expectations.map((item) => item.email.toLowerCase()));
    const serviceAccountEmail = getServiceAccountConfig()?.clientEmail ?? null;
    const isInherentOwner = (rule: CalendarAccessRule) =>
      isInherentOwnerEmail(rule.email, calendar.googleCalendarId, serviceAccountEmail, adminEmail);

    // Assigned users' live ACL roles: the sync above only fills in missing
    // rules, so an admin-upgraded role (writer/owner) survives here.
    const assignedRoles: Record<string, string> = {};
    for (const email of assigned) {
      const rule = acls.find((item) => item.email.toLowerCase() === email.toLowerCase());
      if (rule) {
        assignedRoles[email] = rule.role;
      }
    }

    const granted = grantedUsers.map((user) => {
      const rule = acls.find((item) => item.email.toLowerCase() === user.email.toLowerCase());
      return rule ? { ...user, role: rule.role } : user;
    });
    let additional = acls.filter(
      (rule) => !managedEmails.has(rule.email.toLowerCase()) && !isInherentOwner(rule),
    );

    // Legacy adoption: a raw rule predating this feature can match a roster
    // user who was never given a grant row (cross-department access used to be
    // granted by typing the user's email here). Adopt such rules into managed
    // rows so they become visible under "Granted access" and stay reconciled on
    // email changes. Reconcile-on-read philosophy: the read writes intent.
    if (additional.length > 0) {
      const [userRows, calRows] = await Promise.all([
        db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            departmentId: users.departmentId,
          })
          .from(users),
        db.select({ id: calendars.id, name: calendars.name }).from(calendars),
      ]);
      const byEmail = new Map(
        userRows
          .filter((row) => row.email?.trim())
          .map((row) => [row.email!.trim().toLowerCase(), row]),
      );
      const calendarNames = Object.fromEntries(calRows.map((row) => [row.id, row.name]));
      const kept: CalendarAccessRule[] = [];
      for (const rule of additional) {
        const user = byEmail.get(rule.email.toLowerCase());
        if (!user || user.departmentId === calendarId) {
          kept.push(rule);
          continue;
        }
        try {
          await db
            .insert(userCalendarAccess)
            .values({ userId: user.id, calendarId, role: normalizeGrantRole(rule.role) })
            .onConflictDoNothing();
        } catch {
          kept.push(rule);
          continue;
        }
        granted.push({
          email: rule.email,
          name: user.name,
          departmentName: user.departmentId ? (calendarNames[user.departmentId] ?? null) : null,
          role: rule.role,
        });
      }
      additional = kept;
    }

    const warnings: string[] = [];
    if (adminEmail && failed.includes("admin")) {
      warnings.push("Could not grant admin owner access");
    }
    const failedEmails = failed.filter((email) => email !== "admin");
    if (failedEmails.length > 0) {
      warnings.push(`Could not share with: ${failedEmails.join(", ")}`);
    }

    const result: DepartmentAccess = {
      assigned,
      assignedRoles,
      granted,
      additional,
      admin: adminEmail || null,
    };
    return warnings.length > 0 ? { ...result, syncWarning: warnings.join(" · ") } : result;
  } catch (error) {
    return {
      assigned,
      assignedRoles: {},
      granted: grantedUsers,
      additional: [],
      admin: adminEmail || null,
      syncWarning: error instanceof Error ? error.message : "Could not sync calendar access",
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
  /**
   * The changed user's id. When present (and `desiredAccess` is provided) the
   * cross-department grant rows are diffed to match before the ACL reconcile,
   * so removals revoke and additions/role changes grant.
   */
  userId?: string;
  /** The normalized desired cross-department grants (own department excluded). */
  desiredAccess?: UserCalendarGrant[];
}

/** Apply the DB diff of a user's grant rows, returning what changed. */
async function syncUserCalendarAccessRows(
  userId: string,
  desired: UserCalendarGrant[],
): Promise<{ added: Set<string>; removed: Set<string>; updated: Set<string> }> {
  const existing = await db
    .select()
    .from(userCalendarAccess)
    .where(eq(userCalendarAccess.userId, userId));
  const before = new Map(existing.map((row) => [row.calendarId, row.role]));
  const after = new Map(desired.map((grant) => [grant.calendarId, grant.role]));

  const added = new Set<string>();
  const removed = new Set<string>();
  const updated = new Set<string>();

  for (const grant of desired) {
    if (!before.has(grant.calendarId)) {
      added.add(grant.calendarId);
    } else if (before.get(grant.calendarId) !== grant.role) {
      updated.add(grant.calendarId);
    }
  }
  for (const [calendarId] of before) {
    if (!after.has(calendarId)) {
      removed.add(calendarId);
    }
  }

  if (removed.size > 0) {
    const ids = [...removed];
    await db
      .delete(userCalendarAccess)
      .where(
        and(eq(userCalendarAccess.userId, userId), inArray(userCalendarAccess.calendarId, ids)),
      );
  }
  for (const calendarId of added) {
    const role = after.get(calendarId)!;
    await db.insert(userCalendarAccess).values({ userId, calendarId, role });
  }
  for (const calendarId of updated) {
    const role = after.get(calendarId)!;
    await db
      .update(userCalendarAccess)
      .set({ role, updatedAt: new Date() })
      .where(
        and(eq(userCalendarAccess.userId, userId), eq(userCalendarAccess.calendarId, calendarId)),
      );
  }

  return { added, removed, updated };
}

/**
 * Reconcile Google Calendar ACLs after a user change (create, email change,
 * department move, or grant-list change). When `desiredAccess` is provided the
 * user's grant rows are first diffed to match. For each affected department
 * calendar the managed expectations (members + grants) are ensured at their
 * roles, and any of the user's emails that no expectation holds anymore are
 * revoked (never an inherent owner). Affected calendars = the old/new
 * department, plus every grant-row calendar that was added, updated, removed,
 * or that must move the email when it changed.
 *
 * Runs after the DB commit; failures degrade to human-readable warnings and
 * never fail or roll back the already-committed roster change. When Google is
 * unconfigured the grant-row diff still applies (the rows are the intent), but
 * no ACL work happens and no warnings are produced.
 */
export async function reconcileUserAccessChange(change: UserAccessChange): Promise<string[]> {
  const warnings: string[] = [];
  const oldEmail = change.oldEmail?.trim() || null;
  const newEmail = change.newEmail?.trim() || null;
  const emailChanged = (oldEmail ?? "") !== (newEmail ?? "");

  const desired = change.desiredAccess ?? undefined;
  let added = new Set<string>();
  let updated = new Set<string>();
  let removed = new Set<string>();
  if (change.userId && desired) {
    const sync = await syncUserCalendarAccessRows(
      change.userId,
      normalizeAccessSelection(desired, change.newDepartmentId),
    );
    added = sync.added;
    updated = sync.updated;
    removed = sync.removed;
  }

  const affected = new Set<string>();
  if (change.oldDepartmentId) {
    affected.add(change.oldDepartmentId);
  }
  if (change.newDepartmentId) {
    affected.add(change.newDepartmentId);
  }
  if (change.userId) {
    let rowCalendarIds: string[] = [];
    let grantActivity = false;
    if (desired) {
      rowCalendarIds = desired.map((grant) => grant.calendarId);
      grantActivity = added.size > 0 || updated.size > 0 || removed.size > 0;
    } else if (emailChanged) {
      const rows = await db
        .select({ calendarId: userCalendarAccess.calendarId })
        .from(userCalendarAccess)
        .where(eq(userCalendarAccess.userId, change.userId));
      rowCalendarIds = rows.map((row) => row.calendarId);
    }
    for (const calendarId of rowCalendarIds) {
      if (emailChanged || grantActivity || added.has(calendarId) || updated.has(calendarId)) {
        affected.add(calendarId);
      }
    }
    for (const calendarId of removed) {
      affected.add(calendarId);
    }
  }

  if (affected.size === 0 || !googleCalendarConfigured()) {
    return warnings;
  }

  const revokeCandidates = [
    ...new Set([oldEmail, newEmail].filter((email): email is string => Boolean(email))),
  ];
  for (const departmentId of affected) {
    const googleCalendarId = await resolveGoogleCalendarId(departmentId);
    if (!googleCalendarId) {
      continue;
    }
    const expectations = await accessExpectationsForCalendar(departmentId);
    try {
      const { failed } = await reconcileCalendarToExpectations(
        googleCalendarId,
        expectations,
        revokeCandidates,
      );
      if (failed.length > 0) {
        warnings.push(`Could not sync calendar access for: ${failed.join(", ")}`);
      }
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "Could not sync calendar access");
    }
  }

  return warnings;
}

/**
 * Adopt pre-existing raw ACL rules for an email that a user account now owns:
 * scan every department calendar's ACLs and turn each matching rule on a
 * calendar that is not the user's own department into a managed grant row
 * (role clamped to reader/writer/owner), so the access keeps working and
 * becomes manageable from user settings. Safe to run after a user is created
 * or their email changes. Returns human-readable warnings; per-calendar read
 * failures never abort the scan.
 */
export async function adoptExternalAccessForEmail(
  userId: string,
  email: string,
  ownDepartmentId: string | null,
): Promise<string[]> {
  const warnings: string[] = [];
  const trimmed = email.trim();
  if (!googleCalendarConfigured() || !trimmed) {
    return warnings;
  }
  const lower = trimmed.toLowerCase();

  const [calendarsRows, existingRows] = await Promise.all([
    db
      .select({
        id: calendars.id,
        name: calendars.name,
        googleCalendarId: calendars.googleCalendarId,
      })
      .from(calendars),
    db
      .select({ calendarId: userCalendarAccess.calendarId })
      .from(userCalendarAccess)
      .where(eq(userCalendarAccess.userId, userId)),
  ]);
  const existingCalendars = new Set(existingRows.map((row) => row.calendarId));
  const serviceAccountEmail = getServiceAccountConfig()?.clientEmail ?? null;
  const adminEmail = getAdminGoogleEmail();
  const integration = await getGoogleIntegration();

  const adopted: string[] = [];
  for (const calendar of calendarsRows) {
    if (calendar.id === ownDepartmentId || existingCalendars.has(calendar.id)) {
      continue;
    }
    let acls: CalendarAccessRule[];
    try {
      acls = await integration.listCalendarAccess(calendar.googleCalendarId);
    } catch {
      warnings.push(`Could not verify existing access on: ${calendar.name}`);
      continue;
    }
    const rule = acls.find((item) => item.email.toLowerCase() === lower);
    if (
      !rule ||
      isInherentOwnerEmail(rule.email, calendar.googleCalendarId, serviceAccountEmail, adminEmail)
    ) {
      continue;
    }
    try {
      await db
        .insert(userCalendarAccess)
        .values({
          userId,
          calendarId: calendar.id,
          role: normalizeGrantRole(rule.role),
        })
        .onConflictDoNothing();
    } catch {
      warnings.push(`Could not adopt existing access on: ${calendar.name}`);
      continue;
    }
    adopted.push(calendar.name);
  }

  if (adopted.length > 0) {
    warnings.push(`Adopted existing access on: ${adopted.join(", ")}`);
  }
  return warnings;
}
