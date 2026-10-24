import { headers } from "next/headers";

import { DashboardShellSkeleton } from "./DashboardShellSkeleton";

/**
 * Route-level loading fallback. Dashboard views are on-demand tabs stored
 * server-side, so a generic skeleton can't be shaped to the arriving view —
 * the whole content area loads as one plain box (see
 * docs/loading-transitions.md). The client `DashboardScreen` renders the same
 * skeleton while it reads the device-local snapshot, so the two read as one.
 *
 * The brand overlay is a cold-boot affordance: soft navigations arrive as RSC
 * requests carrying the `rsc: 1` header (the same signal the service worker
 * uses in `swRules.ts`), while a genuine document load — PWA launch, F5,
 * Force refresh — does not. Gating it here keeps the overlay out of soft-nav
 * payloads entirely; the client-side `coldLaunch` flag then retires it once
 * the cold-start tail settles.
 */
export default async function DashboardLoading() {
  const isSoftNavigation = (await headers()).get("rsc") === "1";
  return <DashboardShellSkeleton brand={!isSoftNavigation} />;
}
