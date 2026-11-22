"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Live height of an element, for chrome whose height the page has to reserve
 * space for. The mobile control pill used to carry a hardcoded height per page
 * (58px on Contacts, 50px on Parade State …), which was only true while the
 * pill held one row — the pill's control strip now wraps to a second row on
 * narrow phones, so the page pad and any row floating above the pill must
 * follow the measured box.
 *
 * Returns a **callback ref** rather than observing an object ref: the pill
 * lives in a Mantine `Affix` portal, and a callback fires the moment the node
 * is attached (including when the portal mounts after the first commit), so the
 * measurement can never be armed against a node that does not exist yet.
 * Reads `offsetHeight` (not the observer entry's box) so a pill hidden with
 * `display: none` at `lg`+ reports `0`.
 */
export function useElementHeight(): [(node: HTMLElement | null) => void, number] {
  const [height, setHeight] = useState(0);
  // Detach armed by the previous attach, so a remount (or the pill unmounting
  // at `lg`+) never leaves an observer and its window listeners behind.
  const detachRef = useRef<(() => void) | null>(null);

  const attach = useCallback((node: HTMLElement | null) => {
    detachRef.current?.();
    detachRef.current = null;
    if (!node) {
      setHeight(0);
      return;
    }
    const update = () => {
      const next = node.offsetHeight;
      setHeight((prev) => (prev === next ? prev : next));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    // Belt-and-braces: a fold/posture change or a breakpoint flip can settle
    // after the observer's notification, and some engines coalesce it past the
    // paint (same reasoning as the dashboard's chrome measurement).
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    detachRef.current = () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  // Unmount with the node still attached: React runs this after it has dropped
  // the ref, but a ref never detached (page unmount) still needs the teardown.
  useEffect(() => () => detachRef.current?.(), []);

  return [attach, height];
}
