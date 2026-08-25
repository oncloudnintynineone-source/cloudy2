import { cookies } from "next/headers";

import { AppShellShell } from "@/components/AppShellShell";
import { getBanner } from "@/lib/settings/queries";
import { requireSession } from "@/lib/session";
import { UI_STATE_COOKIE, decodeUiState } from "@/lib/ui/uiState";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  // The remembered desktop sidebar state lives in the client-owned `cloudy2.ui`
  // cookie; read it here, before first paint, so the shell renders the
  // remembered rail state with no client-side restore (no flash, no
  // hydration mismatch). The shell writes every toggle back to the cookie.
  const uiState = decodeUiState((await cookies()).get(UI_STATE_COOKIE)?.value);
  // The admin-managed announcement banner rides every authenticated render
  // (null when disabled, which keeps today's layout exactly).
  const banner = await getBanner();
  return (
    <AppShellShell
      role={session.user.role}
      name={session.user.name ?? ""}
      sidebarCollapsed={uiState?.sidebarCollapsed === true}
      banner={banner}
    >
      {children}
    </AppShellShell>
  );
}
