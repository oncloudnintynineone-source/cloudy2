import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";

/**
 * Returns the current session or redirects to the login page when
 * unauthenticated. Use inside Server Components and route handlers.
 */
export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }
  return session;
}

/**
 * Returns the current session only if the user is an admin, otherwise
 * redirects to the login page (or dashboard if merely authenticated).
 */
export async function requireAdmin() {
  const session = await requireSession();
  if (session.user.role !== "admin") {
    redirect("/dashboard");
  }
  return session;
}

/** Non-throwing session lookup (for optional user in server components). */
export function getSession() {
  return getServerSession(authOptions);
}
