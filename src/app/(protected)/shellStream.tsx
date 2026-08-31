import { BannerLoaded, KahNavFlag } from "@/components/ShellChrome";
import { BANNER_HEIGHT_PX } from "@/lib/banner/banner";
import { userHasKahGroup } from "@/lib/kah/status";
import { getBanner } from "@/lib/settings/queries";

/**
 * The streamed announcement-banner slot. Rendered by the (protected) layout
 * inside a <Suspense> so the AppShell + route skeleton paint before this DB
 * read resolves — a Neon cold start after scale-to-zero must not hold up first
 * paint (the Android PWA splash dismisses on that paint). Resolves to
 * BannerLoaded, which collapses the reserved slot when no banner is configured.
 */
export async function ShellBanner() {
  const config = await getBanner();
  return <BannerLoaded config={config} />;
}

/**
 * The streamed KAH-status nav probe. Rendered by the (protected) layout inside
 * a <Suspense>; resolves to a flag that reveals the KAH Status nav entry when
 * the signed-in user belongs to at least one group. Skipped for admins (they
 * always see the entry).
 */
export async function ShellKahNav({ userId }: { userId: string }) {
  const has = await userHasKahGroup(userId);
  if (!has) return null;
  return <KahNavFlag />;
}

/**
 * The Suspense fallback for the banner slot: a 25px spacer so the header keeps
 * its reserved banner height while the DB read is pending — a configured banner
 * then streams in without shifting the header, and a null result collapses it.
 */
export function BannerPlaceholder() {
  return <div style={{ flexShrink: 0, minHeight: BANNER_HEIGHT_PX }} aria-hidden />;
}