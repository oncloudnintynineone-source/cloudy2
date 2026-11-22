"use client";

import { useEffect, useState } from "react";

/**
 * The browser's connectivity report (`navigator.onLine`) as React state.
 * Starts online and flips inside an effect — the same SSR/hydration-safe
 * pattern the global `OfflineBanner` uses (it consumes this hook, so the amber
 * strip and every offline-aware affordance agree on one signal).
 *
 * Treat `offline === true` as the conservative signal it is: a flaky
 * connection keeps reporting online, and only a genuinely interface-less
 * device reports offline. Consumers use it as an enhancement (marking
 * create/save affordances unavailable with a reason, docs/ui-ux-improvements.md
 * D7), never as a hard gate — the server stays the authority.
 */
export function useIsOffline(): boolean {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return offline;
}
