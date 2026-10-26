import { notFound, redirect } from "next/navigation";

import { decodeDashboardViewShare, shareTokenSecret } from "@/lib/dashboardViews/shareToken";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Public landing route for a shared calendar view. Verifies the self-contained
 * token, then either sends a signed-out visitor through login (returning
 * straight to the dashboard share dialog) or the signed-in user to the
 * dashboard, which opens the import dialog from `?share=`.
 *
 * Kept outside the `(protected)` layout so the login hop works; the token
 * itself carries no privileged data (the import action re-validates it).
 */
export default async function SharedViewLandingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const secret = shareTokenSecret();
  if (!secret || !decodeDashboardViewShare(token, secret)) {
    notFound();
  }
  const target = `/dashboard?share=${encodeURIComponent(token)}`;
  const session = await getSession();
  if (!session?.user) {
    redirect(`/login?next=${encodeURIComponent(target)}`);
  }
  redirect(target);
}
