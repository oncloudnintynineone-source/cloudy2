import { notFound } from "next/navigation";

import { PageContainer } from "@/components/PageContainer";
import { PageTransition } from "@/components/PageTransition";
import { DEFAULT_KAH_RANGE_MONTHS } from "@/lib/kah/range";
import { userHasKahGroup } from "@/lib/kah/status";
import { buildKahStatusViewData } from "@/lib/kah/viewData";
import { requireSession } from "@/lib/session";

import { KahStatusView } from "./KahStatusView";

/**
 * The KAH Status page's initial render: the default six-month forward-only
 * look-ahead. The range dropdown is a per-view (never persisted) client choice —
 * changing it re-fetches through `getKahStatusView`, so a fresh load always
 * opens on the default again.
 *
 * Access is KAH membership or admin: the nav entry only appears for those
 * users, and a direct URL guess by anyone else is a plain not-found (no data,
 * no hint that the page exists).
 */
export default async function KahStatusPage() {
  const session = await requireSession();
  const isAdmin = session.user.role === "admin";
  if (!isAdmin && !(await userHasKahGroup(session.user.id))) {
    notFound();
  }
  const data = await buildKahStatusViewData({
    userId: session.user.id,
    role: session.user.role,
    rangeMonths: DEFAULT_KAH_RANGE_MONTHS,
  });

  return (
    <PageTransition>
      <PageContainer>
        <KahStatusView initial={data} currentUserId={session.user.id} />
      </PageContainer>
    </PageTransition>
  );
}
