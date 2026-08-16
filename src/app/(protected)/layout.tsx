import { AppShellShell } from "@/components/AppShellShell";
import { requireSession } from "@/lib/session";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  return <AppShellShell role={session.user.role}>{children}</AppShellShell>;
}
