import { Suspense } from "react";
import { cookies } from "next/headers";

import { clampMonthZoom } from "@/lib/ui/monthZoom";
import { clampZoom } from "@/lib/ui/slotZoom";
import { UI_STATE_COOKIE, decodeUiState } from "@/lib/ui/uiState";
import { requireSession } from "@/lib/session";
import { DashboardScreen } from "./DashboardScreen";
import DashboardLoading from "./loading";

/**
 * The Calendar route is a thin server shell (docs/pwa-offline.md). It resolves
 * only the session and the device-local zoom state, then hands off to the
 * client `DashboardScreen`, which paints the last on-device snapshot instantly
 * and revalidates via the `loadDashboardData` server action. All the heavy
 * reads (tabs, filters, calendars, users, settings, events) moved into that
 * action so the route no longer blocks first paint.
 */
export default async function DashboardPage() {
  const session = await requireSession();
  // Per-device zoom state is read from the client-owned `cloudy2.ui` cookie
  // before first paint so a cold open restores the last zoom with no width jump.
  const nav = decodeUiState((await cookies()).get(UI_STATE_COOKIE)?.value)?.dashboard;
  const initialZoom = clampZoom(nav?.zoom) ?? 1;
  const initialMonthZoom = clampMonthZoom(nav?.monthZoom) ?? 1;

  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardScreen
        userId={session.user.id}
        initialZoom={initialZoom}
        initialMonthZoom={initialMonthZoom}
      />
    </Suspense>
  );
}
