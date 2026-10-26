import { Suspense } from "react";
import { cookies } from "next/headers";

import { AppShellShell } from "@/components/AppShellShell";
import { ColdStartReadyProvider } from "@/components/ColdStartReady";
import { MotionProvider } from "@/components/MotionProvider";
import { googleCalendarConfigured } from "@/lib/google";
import { motionCssText, resolveMotion } from "@/lib/motion/profile";
import { requireSession } from "@/lib/session";
import { getBanner, getSettings } from "@/lib/settings/queries";
import {
  bottomNavVariantFlag,
  motionProfileFlag,
  pinnedTickerIndicatorFlag,
  resolveFlagValue,
  translucencyLevelFlag,
} from "@/lib/settings/featureFlags";
import { UI_STATE_COOKIE, decodeUiState } from "@/lib/ui/uiState";
import { ShellKahNav } from "./shellStream";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  // The session is a JWT decode (no DB); the banner read is a cheap single-row
  // SELECT on the singleton settings row. Reading both up front — rather than
  // streaming the banner — means the shell knows the banner state from first
  // paint: the header (banner present or bare 56px bar) and the route skeleton
  // are aligned with the steady-state layout with no post-hydration jump.
  const [session, bannerConfig, settings] = await Promise.all([
    requireSession(),
    getBanner(),
    getSettings(),
  ]);
  // The remembered desktop sidebar state lives in the client-owned `cloudy2.ui`
  // cookie; read it here, before first paint, so the shell renders the
  // remembered rail state with no client-side restore (no flash, no
  // hydration mismatch). The shell writes every toggle back to the cookie.
  const uiState = decodeUiState((await cookies()).get(UI_STATE_COOKIE)?.value);
  const isAdmin = session.user.role === "admin";
  // The org-wide motion profile is published as CSS custom properties on
  // `:root` (server-rendered, so no hydration flash) and handed to the client
  // as `MotionProvider` tokens for Mantine/JS animations. `:root:root` wins
  // over the standard fallback block in globals.css. See docs/motion.md.
  const motion = resolveMotion(
    resolveFlagValue(motionProfileFlag, settings.featureFlags.motionProfile),
  );
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: motionCssText(motion) }} />
      <MotionProvider motion={motion}>
        <ColdStartReadyProvider>
          <AppShellShell
            userId={session.user.id}
            role={session.user.role}
            name={session.user.name ?? ""}
            phone={session.user.phone}
            googleConfigured={googleCalendarConfigured()}
            sidebarCollapsed={uiState?.sidebarCollapsed === true}
            bannerConfig={bannerConfig}
            pinnedTickerIndicator={resolveFlagValue(
              pinnedTickerIndicatorFlag,
              settings.featureFlags.pinnedTickerIndicator,
            )}
            translucencyLevel={resolveFlagValue(
              translucencyLevelFlag,
              settings.featureFlags.translucencyLevel,
            )}
            bottomNavVariant={resolveFlagValue(
              bottomNavVariantFlag,
              settings.featureFlags.bottomNavVariant,
            )}
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
      </MotionProvider>
    </>
  );
}
