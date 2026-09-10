import { KahNavFlag } from "@/components/ShellChrome";
import { userHasKahGroup } from "@/lib/kah/status";

/**
 * The streamed KAH-status nav probe. Rendered by the (protected) layout inside
 * a <Suspense>; resolves to a flag that reveals the KAH Status nav entry when
 * the signed-in user belongs to at least one group. Skipped for admins (they
 * always see the entry).
 *
 * The announcement banner is deliberately NOT streamed: its config is resolved
 * by the layout in parallel with the session and passed to the shell as a prop
 * (`bannerConfig`), so the header and route skeleton are aligned from first
 * paint — see docs/announcement-banner.md §1.3.
 */
export async function ShellKahNav({ userId }: { userId: string }) {
  const has = await userHasKahGroup(userId);
  if (!has) return null;
  return <KahNavFlag />;
}