"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Temporary diagnostic overlay for iOS PWA viewport debugging.
 * Shows live viewport / shell measurements. Remove after diagnosis.
 *
 * Activate via:
 *   - NEXT_PUBLIC_VIEWPORT_DEBUG=1 build env, OR
 *   - ?vpdebug or #vpdebug in the URL
 */

const REFRESH_MS = 500;

function probeInset(side: "top" | "bottom"): number {
  const el = document.createElement("div");
  el.style.position = "absolute";
  el.style.visibility = "hidden";
  if (side === "top") el.style.paddingTop = "env(safe-area-inset-top)";
  else el.style.paddingBottom = "env(safe-area-inset-bottom)";
  document.body.appendChild(el);
  const cs = getComputedStyle(el);
  const val = Number(side === "top" ? cs.paddingTop : cs.paddingBottom);
  document.body.removeChild(el);
  return val;
}

function gatherLines(): string[] {
  const d = document;
  const w = window;
  const vv = w.visualViewport;
  const standalone = w.matchMedia("(display-mode: standalone)").matches;

  const innerH = w.innerHeight;
  const clientH = d.documentElement.clientHeight;
  const scrollH = d.scrollingElement?.scrollHeight ?? 0;
  const scrollY = w.scrollY;

  const vvH = vv?.height ?? NaN;
  const vvOffset = vv?.offsetTop ?? NaN;
  const vvPageTop = vv?.pageTop ?? NaN;

  const envTop = probeInset("top");
  const envBottom = probeInset("bottom");

  const root = d.querySelector(".app-shell-root");
  const cs = root ? getComputedStyle(root) : null;
  const headerOff = cs?.getPropertyValue("--app-shell-header-offset") ?? "n/a";
  const footerOff = cs?.getPropertyValue("--app-shell-footer-offset") ?? "n/a";
  const bannerH = cs?.getPropertyValue("--app-banner-height") ?? "n/a";

  const headerEl = root?.querySelector(":scope > header");
  const footerEl = root?.querySelector(":scope > footer");
  const mainEl = root?.querySelector(":scope > main");
  const headerR = headerEl?.getBoundingClientRect();
  const footerR = footerEl?.getBoundingClientRect();
  const mainR = mainEl?.getBoundingClientRect();
  const mainCs = mainEl ? getComputedStyle(mainEl) : null;

  return [
    `standalone(media): ${standalone}`,
    `innerH: ${innerH}  clientH: ${clientH}  scrollH: ${scrollH}  scrollY: ${scrollY}`,
    `vv.height: ${vvH}  vv.offsetTop: ${vvOffset}  vv.pageTop: ${vvPageTop}`,
    `envTop: ${envTop}px  envBottom: ${envBottom}px`,
    `--header-offset: ${headerOff}  --footer-offset: ${footerOff}  --banner-h: ${bannerH}`,
    `header: top=${Math.round(headerR?.top ?? NaN)} h=${Math.round(headerR?.height ?? NaN)}`,
    `footer: bottom=${Math.round((footerR?.bottom ?? NaN) - vvH)} h=${Math.round(footerR?.height ?? NaN)}`,
    `main: top=${Math.round(mainR?.top ?? NaN)} minH=${mainCs?.minHeight ?? "n/a"} padT=${mainCs?.paddingTop ?? "n/a"}`,
  ];
}

export function ViewportDebug() {
  const active = useMemo(() => {
    if (typeof window === "undefined") return false;
    return (
      process.env.NEXT_PUBLIC_VIEWPORT_DEBUG === "1" ||
      window.location.search.includes("vpdebug") ||
      window.location.hash.includes("vpdebug")
    );
  }, []);

  const [lines, setLines] = useState<string[]>(() => (active ? ["measuring…"] : []));

  useEffect(() => {
    if (!active) return;

    let mounted = true;
    const tick = () => {
      if (mounted) setLines(gatherLines());
    };

    tick();
    const id = setInterval(tick, REFRESH_MS);
    window.addEventListener("resize", tick);
    const onOrientation = () => setTimeout(tick, 400);
    window.addEventListener("orientationchange", onOrientation);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", tick);
    return () => {
      mounted = false;
      clearInterval(id);
      window.removeEventListener("resize", tick);
      window.removeEventListener("orientationchange", onOrientation);
      vv?.removeEventListener("resize", tick);
    };
  }, [active]);

  if (!active || lines.length === 0) return null;

  return (
    <pre
      style={{
        position: "fixed",
        bottom: "env(safe-area-inset-bottom, 0px)",
        left: 4,
        zIndex: 9999,
        pointerEvents: "none",
        margin: 0,
        padding: "4px 6px",
        background: "rgba(0,0,0,0.82)",
        color: "#0f0",
        fontSize: 10,
        lineHeight: "1.35",
        fontFamily: "monospace",
        whiteSpace: "pre",
        borderRadius: 4,
        maxWidth: "calc(100vw - 8px)",
        overflow: "hidden",
      }}
    >
      {lines.join("\n")}
    </pre>
  );
}
