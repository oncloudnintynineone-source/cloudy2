"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { Modal, useMantineTheme } from "@mantine/core";
import { useMediaQuery, useViewportSize } from "@mantine/hooks";
import { NARROW_MEDIA_QUERY } from "@/lib/theme";

import { addSearchHistoryEntry, removeSearchHistoryEntry } from "@/lib/events/searchHistory";
import {
  getSearchHistory,
  recordSearchHistory,
  removeSearchHistory,
} from "@/lib/events/searchHistoryActions";
import { modalContentWidth, type Rect } from "@/lib/motion/origin";
import { modalZoomTransitionProps } from "@/lib/motion/transitions";
import { useMotion } from "@/components/MotionProvider";

import EventSearchBodySkeleton from "./EventSearchBodySkeleton";

// Only the search body (its `@mantine/dates` DatePickerInputs and the result
// list) is lazy — the Modal chrome is static and always mounted, so the zoom
// out of the trigger plays on every open, even when the body chunk is still
// downloading (the skeleton paints inside the already-animating dialog).
const EventSearchBody = dynamic(() => import("./EventSearchBody"), {
  ssr: false,
  loading: () => <EventSearchBodySkeleton />,
});

// `next/dynamic` returns a `React.ComponentType`, but the runtime Loadable also
// carries a `.preload()` static that fetches the chunk without mounting. The
// shell calls this on near signals (hover/focus/pointer-down on the search
// trigger) so the first open paints real content instead of the body skeleton.
export function preloadEventSearchBody() {
  (EventSearchBody as unknown as { preload?: () => Promise<unknown> }).preload?.();
}

interface EventSearchModalProps {
  opened: boolean;
  onClose: () => void;
  originRect: Rect | null;
}

export default function EventSearchModal({
  opened,
  onClose,
  originRect,
}: EventSearchModalProps) {
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const isNarrow = useMediaQuery(NARROW_MEDIA_QUERY);

  // The user's recent queries (`null` = not yet fetched). Owned by the chrome
  // so it is prefetched at shell mount (long before the first open) and
  // survives open/close cycles; the body only renders pills from this prop.
  const [history, setHistory] = useState<string[] | null>(null);

  // Preload the body chunk shortly after mount (idle, so it never competes
  // with launch-critical work) so the first open paints real content instead
  // of the body skeleton.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const preload = () => {
      (EventSearchBody as unknown as { preload?: () => Promise<unknown> }).preload?.();
    };
    const hasIdle = typeof window.requestIdleCallback === "function";
    let id: number;
    if (hasIdle) {
      id = window.requestIdleCallback(preload, { timeout: 2000 });
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
  }, []);

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
  // Resize-subscribed viewport (Mantine hook) rather than a raw window read
  // during render.
  const motion = useMotion();
  const viewportSize = useViewportSize();
  const viewport = { w: viewportSize.width, h: viewportSize.height };
  const contentWidth = modalContentWidth(viewport, isNarrow ? 380 : isDesktop ? 620 : 440);
  const transitionProps = modalZoomTransitionProps(motion, originRect, viewport, contentWidth);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Search events"
      centered
      size={isNarrow ? "xs" : isDesktop ? "lg" : "md"}
      transitionProps={transitionProps}
      closeButtonProps={{ "aria-label": "Close search" }}
    >
      <EventSearchBody
        history={history}
        onRecordSearch={recordSearch}
        onRemoveSearch={removeSearch}
        onClose={onClose}
      />
    </Modal>
  );
}
