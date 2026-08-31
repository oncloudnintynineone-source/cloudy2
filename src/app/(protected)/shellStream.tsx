import { BannerLoaded, KahNavFlag } from "@/components/ShellChrome";
import { userHasKahGroup } from "@/lib/kah/status";
import { getBanner } from "@/lib/settings/queries";

/**
 * The streamed announcement-banner slot. Rendered by the (protected) layout
 * inside a <Suspense> so the AppShell + route skeleton paint before this DB
 * read resolves — a Neon cold start after scale-to-zero must not hold up first
 * paint (the Android PWA splash dismisses on that paint). Resolves to
 * BannerLoaded, which grows the header only when a banner is actually
 * configured — nothing is reserved while pending.
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
 * The Suspense fallback for the banner slot. Renders nothing: the shell
 * deliberately does NOT reserve the banner's height while the DB read is
 * pending, so the header starts at the bare 56px bar and a null resolve leaves
 * the layout unchanged. A configured banner grows the header when it streams
 * in, which is the accepted trade-off for never flashing a phantom gap.
 */
export function BannerPlaceholder() {
  return null;
}