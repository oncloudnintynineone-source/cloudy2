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

/**
 * A non-admin may create/edit events as themselves, and (on edit) keep an
 * event's existing creator — but never introduce a different creator. Admins
 * may act on behalf of any user. Returns an error message when denied.
 */
export function creatorGuard(
  session: GuardSession,
  pendingCreatorId: string,
  originalCreatorId: string | null,
): string | null {
  if (session.user.role === "admin") {
    return null;
  }
  if (!pendingCreatorId || pendingCreatorId === session.user.id) {
    return null;
  }
  if (originalCreatorId && pendingCreatorId === originalCreatorId) {
    return null;
  }
  return "You can only create or edit events for yourself";
}

/**
 * A non-admin may only edit or delete events they created. Events with no
 * recorded creator (legacy/external) are admin-only. Admins may act on any
 * event. Returns an error message when denied.
 */
export function ownershipGuard(
  session: GuardSession,
  creatorId: string | null,
): string | null {
  if (session.user.role === "admin") {
    return null;
  }
  if (creatorId && creatorId === session.user.id) {
    return null;
  }
  return "You can only edit or delete your own events";
}
