import { Suspense } from "react";
import { cookies } from "next/headers";

import { AppShellShell } from "@/components/AppShellShell";
import { ColdStartReadyProvider } from "@/components/ColdStartReady";
import { googleCalendarConfigured } from "@/lib/google";
import { requireSession } from "@/lib/session";
import { getBanner } from "@/lib/settings/queries";
import { UI_STATE_COOKIE, decodeUiState } from "@/lib/ui/uiState";
import { ShellKahNav } from "./shellStream";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  // The session is a JWT decode (no DB); the banner read is a cheap single-row
  // SELECT on the singleton settings row. Reading both up front — rather than
  // streaming the banner — means the shell knows the banner state from first
  // paint: the header (banner present or bare 56px bar) and the route skeleton
  // are aligned with the steady-state layout with no post-hydration jump.
  const [session, bannerConfig] = await Promise.all([requireSession(), getBanner()]);
  // The remembered desktop sidebar state lives in the client-owned `cloudy2.ui`
  // cookie; read it here, before first paint, so the shell renders the
  // remembered rail state with no client-side restore (no flash, no
  // hydration mismatch). The shell writes every toggle back to the cookie.
  const uiState = decodeUiState((await cookies()).get(UI_STATE_COOKIE)?.value);
  const isAdmin = session.user.role === "admin";
  return (
    <ColdStartReadyProvider>
      <AppShellShell
        role={session.user.role}
        name={session.user.name ?? ""}
        phone={session.user.phone}
        googleConfigured={googleCalendarConfigured()}
        sidebarCollapsed={uiState?.sidebarCollapsed === true}
        bannerConfig={bannerConfig}
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
    </ColdStartReadyProvider>
  );
}
