import { DashboardShellSkeleton } from "./DashboardShellSkeleton";

/**
 * Route-level loading fallback. Dashboard views are on-demand tabs stored
 * server-side, so a generic skeleton can't be shaped to the arriving view —
 * the whole content area loads as one plain box (see
 * docs/loading-transitions.md). The client `DashboardScreen` renders the same
 * skeleton while it reads the device-local snapshot, so the two read as one.
 */
export default function DashboardLoading() {
  return <DashboardShellSkeleton />;
}
