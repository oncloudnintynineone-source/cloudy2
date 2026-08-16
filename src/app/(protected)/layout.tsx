import { AppShellShell } from "@/components/AppShellShell";
import { requireSession } from "@/lib/session";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSession();
  return <AppShellShell>{children}</AppShellShell>;
}
