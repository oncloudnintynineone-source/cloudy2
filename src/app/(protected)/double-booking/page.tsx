import { PageContainer } from "@/components/PageContainer";
import { listCalendars } from "@/lib/events/queries";
import { listUsers } from "@/lib/roster/queries";
import { requireSession } from "@/lib/session";

import { DoubleBookingView } from "./DoubleBookingView";

/**
 * The "Double Booking" page: which of the user's *existing* events double-book
 * them (or, for admins, any active roster user) over the next 30 days. The
 * scan itself is a read-only server action run from the client view; the page
 * only supplies the session identity and, for admins, the roster to pick a
 * target from. See docs/user-clashes.md.
 */
export default async function DoubleBookingPage() {
  const session = await requireSession();
  const isAdmin = session.user.role === "admin";

  const calendars = await listCalendars();
  const departmentParentById = new Map(
    calendars.map((calendar) => [calendar.id, calendar.parentId ?? null]),
  );

  const users = isAdmin
    ? (await listUsers())
        .filter((user) => user.status === "active")
        .map((user) => ({
          id: user.id,
          name: user.name,
          shortname: user.shortname,
          departmentId: user.department?.id ?? null,
          departmentName: user.department?.name ?? null,
          departmentSort: user.department?.sortOrder ?? null,
          departmentParentId: user.department?.id
            ? (departmentParentById.get(user.department.id) ?? null)
            : null,
        }))
    : [];

  return (
    <PageContainer>
      <DoubleBookingView currentUserId={session.user.id} isAdmin={isAdmin} users={users} />
    </PageContainer>
  );
}
