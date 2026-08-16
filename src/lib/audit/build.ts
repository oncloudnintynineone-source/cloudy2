/**
 * Pure helpers that build the values of an `audit_logs` row. Kept free of I/O
 * so they can be unit-tested without a database.
 */

export const AUDIT_ACTIONS = {
  authLoginSuccess: "auth.login.success",
  authLoginFailure: "auth.login.failure",
  userCreate: "user.create",
  userUpdate: "user.update",
  userStatusChange: "user.status.change",
  calendarCreate: "calendar.create",
  calendarRename: "calendar.rename",
  calendarDelete: "calendar.delete",
  accessGrant: "access.grant",
  accessRevoke: "access.revoke",
  settingsUpdate: "settings.update",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export interface AuditActor {
  id: string;
  name: string | null;
  role: string;
}

export interface AuditLogInput {
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: AuditAction;
  entityType?: string | null;
  entityId?: string | null;
  entityName?: string | null;
  method?: string | null;
  route?: string | null;
  details?: unknown;
  ip?: string | null;
}

/**
 * Map an actor (session user or admin pseudo-account) to the actor columns of
 * an audit row. The admin pseudo-account has no users row, so its actor id is
 * nulled while name/role are kept for context.
 */
export function actorFromUser(user: AuditActor): {
  actorId: string | null;
  actorName: string | null;
  actorRole: string;
} {
  return {
    actorId: user.id === "admin" ? null : user.id,
    actorName: user.name,
    actorRole: user.role,
  };
}

/** Extract a pathname from a referer header, or null when not a URL. */
export function pathFromReferer(referer: string | null | undefined): string | null {
  if (!referer) {
    return null;
  }
  try {
    const url = new URL(referer);
    return url.pathname;
  } catch {
    return null;
  }
}

/** Build the insert values for an audit_logs row from an input. */
export function buildAuditLog(input: AuditLogInput) {
  return {
    actorId: input.actorId,
    actorName: input.actorName,
    actorRole: input.actorRole,
    action: input.action,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    entityName: input.entityName ?? null,
    method: input.method ?? null,
    route: input.route ?? null,
    details: input.details ?? null,
    ip: input.ip ?? null,
  };
}
