"use client";

import { useEffect, useState } from "react";

let announceListener: ((message: string) => void) | null = null;

/**
 * Pushes a transient status message to the app's polite live region
 * (`StatusAnnouncer`, mounted once in the shell so it survives navigations).
 * For state changes that have no toast — view/date navigation, filter
 * counts, zoom level. No-op before the announcer mounts.
 */
export function announce(message: string) {
  announceListener?.(message);
}

export function StatusAnnouncer() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    let timer = 0;
    announceListener = (next) => {
      // Clear first so two identical messages in a row re-announce (a live
      // region ignores unchanged content).
      setMessage("");
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setMessage(next), 100);
    };
    return () => {
      window.clearTimeout(timer);
      announceListener = null;
    };
  }, []);

  return (
    <div role="status" aria-atomic="true" className="c2-sr-only">
      {message}
    </div>
  );
}
