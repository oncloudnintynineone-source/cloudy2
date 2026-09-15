"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef } from "react";

import { type BannerConfig, BANNER_HEIGHT_PX, bannerColorOption } from "@/lib/banner/banner";

/**
 * Client-side channel between AppShellShell and the shell chrome it renders —
 * the announcement banner and the KAH-status nav entry. AppShellShell provides
 * the setters; the rendered components call them so the shell can track the
 * banner's measured (wrapped) height and reveal the KAH nav item. The banner's
 * presence itself is no longer negotiated here: the (protected) layout resolves
 * the config (in parallel with the session) and passes it to the shell as a
 * prop, so the header is correct from the very first render.
 */
export interface ShellChromeValue {
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
 *
 * Rendered directly by AppShellShell from the (protected) layout's resolved
 * `bannerConfig` prop — never streamed, so the header carries the banner from
 * first paint.
 */
export function AnnouncementBanner({ config }: { config: BannerConfig }) {
  const ref = useRef<HTMLDivElement>(null);
  const { setBannerHeight } = useShellChrome();
  const option = bannerColorOption(config.color);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setBannerHeight(el.offsetHeight);
    // Re-measure only when the banner actually changes size (its text can wrap
    // to a new height). A dependency-less effect here re-measured and pushed
    // state on every shell render.
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => setBannerHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, [setBannerHeight]);

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