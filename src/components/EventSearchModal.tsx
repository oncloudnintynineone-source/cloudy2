"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { canPreloadTabs } from "@/lib/pwa/warmup";

import { addSearchHistoryEntry, removeSearchHistoryEntry } from "@/lib/events/searchHistory";
import {
  getSearchHistory,
  recordSearchHistory,
  removeSearchHistory,
} from "@/lib/events/searchHistoryActions";
import dynamic from "next/dynamic";
import { preloadLazyBody, useChunkReady } from "@/lib/loading/chunkReady";
import type { Rect } from "@/lib/motion/origin";
import { useModalZoom } from "@/lib/motion/useModalZoom";

import { LazyModal } from "@/components/LazyModal";
import EventSearchBodySkeleton from "./EventSearchBodySkeleton";

// Only the search body (its `@mantine/dates` DatePickerInputs and the result
// list) is lazy — the Modal chrome is static and always mounted, so the zoom
// out of the trigger plays on every open, even when the body chunk is still
// downloading (the skeleton paints inside the already-animating dialog and
// dissolves through `CrossfadeSwap` when the chunk lands).
const loadEventSearchBody = () => import("./EventSearchBody").then((mod) => mod.default);
const EventSearchBody = dynamic(loadEventSearchBody, { ssr: false, loading: () => null });

// The shell calls this on near signals (hover/focus/pointer-down on the search
// trigger) so the first open paints real content instead of the body skeleton.
export function preloadEventSearchBody() {
  preloadLazyBody(loadEventSearchBody);
}

interface EventSearchModalProps {
  opened: boolean;
  onClose: () => void;
  originRect: Rect | null;
}

export default function EventSearchModal({ opened, onClose, originRect }: EventSearchModalProps) {
  const searchBodyReady = useChunkReady(loadEventSearchBody, opened);

  // The user's recent queries (`null` = not yet fetched). Owned by the chrome
  // so it is prefetched at shell mount (long before the first open) and
  // survives open/close cycles; the body only renders pills from this prop.
  const [history, setHistory] = useState<string[] | null>(null);

  // A recent-search list is the only proactive signal that this account uses
  // search. Without it, the chunk waits for the trigger's near-signal/open.
  const warmedRef = useRef(false);
  useEffect(() => {
    if (warmedRef.current || !history || history.length === 0) {
      return;
    }
    if (typeof window === "undefined" || !canPreloadTabs()) {
      return;
    }
    const preload = () => {
      warmedRef.current = true;
      preloadEventSearchBody();
    };
    const hasIdle = typeof window.requestIdleCallback === "function";
    let id: number;
    if (hasIdle) {
      id = window.requestIdleCallback(preload, { timeout: 4000 });
    } else {
      id = window.setTimeout(preload, 0);
    }
    return () => {
      if (hasIdle) {
        window.cancelIdleCallback(id);
      } else {
        window.clearTimeout(id);
      }
    };
  }, [history]);

  // Fetch recent searches once on mount so the badges are already present on
  // the first open. Best-effort; a failure keeps the last list (or resolves to
  // empty so the skeleton pills collapse rather than hang).
  useEffect(() => {
    let cancelled = false;
    getSearchHistory()
      .then((result) => {
        if (!cancelled && result.ok) {
          setHistory(result.history);
        }
      })
      .catch(() => {
        setHistory((prev) => prev ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Refresh on every open so queries run on other devices (or cleared
  // elsewhere) surface here.
  useEffect(() => {
    if (!opened) {
      return;
    }
    let cancelled = false;
    getSearchHistory()
      .then((result) => {
        if (!cancelled && result.ok) {
          setHistory(result.history);
        }
      })
      .catch(() => {
        setHistory((prev) => prev ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [opened]);

  const recordSearch = useCallback((term: string) => {
    setHistory((prev) => addSearchHistoryEntry(prev ?? [], term));
    void recordSearchHistory(term);
  }, []);

  const removeSearch = useCallback((term: string) => {
    setHistory((prev) => removeSearchHistoryEntry(prev ?? [], term));
    void removeSearchHistory(term);
  }, []);

  // The modal zooms out of / shrinks back into the tapped search trigger (the
  // app's standard grow/shrink animation; mirror PinnedEventsPanel).
  const { size, transitionProps } = useModalZoom({
    originRect,
    spec: { narrow: "xs", mobile: "md", desktop: "lg" },
  });

  return (
    <LazyModal
      opened={opened}
      onClose={onClose}
      title="Search events"
      size={size}
      transitionProps={transitionProps}
      closeLabel="Close search"
      ready={searchBodyReady}
      skeleton={<EventSearchBodySkeleton />}
    >
      <EventSearchBody
        history={history}
        onRecordSearch={recordSearch}
        onRemoveSearch={removeSearch}
        onClose={onClose}
      />
    </LazyModal>
  );
}
