/**
 * Structural subset of the NextAuth session the guards read; kept minimal and
 * I/O-free so the rules can be unit-tested without a DB or next-auth.
 */
export interface GuardSession {
  user: {
    id: string;
    role: "admin" | "user";
  };
}

/** The stored event facts a modification is authorized against. */
export interface EventModifyTarget {
  /** Recorded organizer id, or null for creator-less (legacy/external) events. */
  creatorId: string | null;
  inviteeUserIds: string[];
  inviteeDepartmentIds: string[];
  /** Organizer-only edit lock; admins always bypass it. */
  ownerOnlyEdits: boolean;
}

/**
 * Who may edit/delete/duplicate an event (create needs no guard — every
 * signed-in user may create):
 *
 * - Admins may act on any event, ignoring the owner-only lock.
 * - A creator-less event with no tagged people (legacy/external) is admin-only.
 * - When the organizer locked the event to themselves, only the organizer may
 *   modify it (admins bypass).
 * - Otherwise the organizer, every individually tagged user, and every active
 *   member of each tagged department may modify it.
 *
 * `activeMembersByDepartment` (department id → active roster user ids) is
 * optional and only consulted for the department-membership branch; callers
 * resolve it from the roster. Returns an error message when denied.
 */
export function modifyGuard(
  session: GuardSession,
  target: EventModifyTarget,
  activeMembersByDepartment?: ReadonlyMap<string, ReadonlyArray<string>>,
): string | null {
  if (session.user.role === "admin") {
    return null;
  }
  if (
    !target.creatorId &&
    target.inviteeUserIds.length === 0 &&
    target.inviteeDepartmentIds.length === 0
  ) {
    return "You can only edit or delete events you created";
  }
  if (target.ownerOnlyEdits && target.creatorId && target.creatorId !== session.user.id) {
    return "Only the organizer can edit this event";
  }
  if (target.creatorId === session.user.id) {
    return null;
  }
  if (target.inviteeUserIds.includes(session.user.id)) {
    return null;
  }
  if (activeMembersByDepartment) {
    for (const departmentId of target.inviteeDepartmentIds) {
      const members = activeMembersByDepartment.get(departmentId);
      if (members && members.includes(session.user.id)) {
        return null;
      }
    }
  }
  return "You can only edit or delete events you're on";
}

/**
 * Whether the actor may change the owner-only edit lock of an event: the
 * organizer themselves or an admin (admins bypass the lock, so they may also
 * set or clear it).
 */
export function canChangeLock(session: GuardSession, creatorId: string | null): boolean {
  return session.user.role === "admin" || (creatorId !== null && creatorId === session.user.id);
}
