import { Suspense } from "react";
import { cookies } from "next/headers";

import { AppShellShell } from "@/components/AppShellShell";
import { requireSession } from "@/lib/session";
import { UI_STATE_COOKIE, decodeUiState } from "@/lib/ui/uiState";
import { BannerPlaceholder, ShellBanner, ShellKahNav } from "./shellStream";

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
  const isAdmin = session.user.role === "admin";
  return (
    <AppShellShell
      role={session.user.role}
      name={session.user.name ?? ""}
      sidebarCollapsed={uiState?.sidebarCollapsed === true}
      bannerSlot={
        <Suspense fallback={<BannerPlaceholder />}>
          <ShellBanner />
        </Suspense>
      }
      kahNavSlot={
        // Admins always see KAH Status (all groups) — skip the membership probe.
        isAdmin ? null : (
          <Suspense fallback={null}>
            <ShellKahNav userId={session.user.id} />
          </Suspense>
        )
      }
    >
      {children}
    </AppShellShell>
  );
}
