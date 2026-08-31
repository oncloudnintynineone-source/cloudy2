"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef } from "react";

import { type BannerConfig, BANNER_HEIGHT_PX, bannerColorOption } from "@/lib/banner/banner";

/**
 * Client-side channel between AppShellShell and the shell chrome it streams
 * from the (protected) layout — the announcement banner and the KAH-status nav
 * entry. AppShellShell provides the setters; the streamed flag/banner
 * components call them once their DB-backed data resolves, so the shell can
 * reserve the banner slot up front (placeholder), collapse it when no banner
 * exists, and reveal the KAH nav item — all without blocking first paint on a
 * database read (the Neon scale-to-zero cold start must not hold up the
 * Android PWA splash screen).
 */
export interface ShellChromeValue {
  /** Called by the resolved banner slot: false collapses the reserved space. */
  setBannerActive: (active: boolean) => void;
  /** Called by the banner on measure, so the header offset tracks wrapped text. */
  setBannerHeight: (px: number) => void;
  /** Called by the KAH probe when the signed-in user belongs to a group. */
  setKahGroup: (present: boolean) => void;
}

export const ShellChromeContext = createContext<ShellChromeValue | null>(null);

export function useShellChrome(): ShellChromeValue {
  const value = useContext(ShellChromeContext);
  if (!value) {
    throw new Error("useShellChrome must be used within an AppShellShell");
  }
  return value;
}

/**
 * The admin-managed announcement banner: a min-height strip (25px) above the
 * navy brand bar, filled with its curated palette color (`-filled` var, so
 * light/dark schemes both work) and the readable text color that option pins.
 * Text wraps and the banner grows taller when it overflows the base height.
 * The measured height is reported through the shell chrome context so the
 * shell's `--app-banner-height` / header-offset math stays exact.
 */
function AnnouncementBanner({ config }: { config: BannerConfig }) {
  const ref = useRef<HTMLDivElement>(null);
  const { setBannerHeight } = useShellChrome();
  const option = bannerColorOption(config.color);

  useEffect(() => {
    if (!ref.current) return;
    setBannerHeight(ref.current.offsetHeight);
  });

  return (
    <div
      ref={ref}
      role="status"
      title={config.text}
      style={{
        flexShrink: 0,
        minHeight: BANNER_HEIGHT_PX,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        paddingInline: "var(--mantine-spacing-md)",
        textAlign: "center",
        background: `var(--mantine-color-${config.color}-filled)`,
        color:
          option.textColor === "dark" ? "var(--mantine-color-black)" : "var(--mantine-color-white)",
        fontSize: "var(--mantine-font-size-sm)",
        fontWeight: 500,
      }}
    >
      <span style={{ width: "100%", overflowWrap: "break-word" }}>{config.text}</span>
    </div>
  );
}

/**
 * The resolved half of the streamed banner slot (mounted by ShellBanner after
 * `getBanner()` resolves): grows the header to include the banner when one
 * exists; a null result leaves the layout untouched. Nothing is reserved while
 * the read is pending (see BannerPlaceholder), so this only ever moves the
 * shell downward — it never collapses a phantom gap.
 */
export function BannerLoaded({ config }: { config: BannerConfig | null }) {
  const { setBannerActive } = useShellChrome();
  useLayoutEffect(() => {
    setBannerActive(config !== null);
  }, [config, setBannerActive]);
  if (!config) return null;
  return <AnnouncementBanner config={config} />;
}

/**
 * The resolved half of the streamed KAH-status probe (mounted by ShellKahNav
 * when the user belongs to at least one group): reveals the KAH Status nav
 * entry. Returns null — presence is carried purely through shell state.
 */
export function KahNavFlag() {
  const { setKahGroup } = useShellChrome();
  useLayoutEffect(() => {
    setKahGroup(true);
  }, [setKahGroup]);
  return null;
}