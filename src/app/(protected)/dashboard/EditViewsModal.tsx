"use client";

import dynamic from "next/dynamic";
import { useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

import { CrossfadeSwap } from "@/components/CrossfadeSwap";
import { FormModalSkeleton } from "@/components/FormModalSkeleton";
import { MotionModal } from "@/components/MotionModal";
import { loadChunk, useChunkReady } from "@/lib/loading/chunkReady";
import { MIN_SKELETON_HOLD_MS } from "@/lib/loading/minHoldLoading";
import { NARROW_MEDIA_QUERY } from "@/lib/theme";
import type { DashboardViewTab } from "@/lib/dashboardViews/views";
import type { ReorderDrag } from "@/lib/settings/featureFlags";

// The manage-views list (reorder, edit, share, delete + the nested dialogs) is
// only needed after a tap. The chrome stays static so the dialog zooms out of
// the gear immediately and the chunk skeleton dissolves inside it
// (docs/loading-transitions.md §1.15.1).
const loadEditViewsBody = () =>
  import("./EditViewsModalBody").then((mod) => mod.EditViewsModalBody);
const EditViewsModalBody = dynamic(loadEditViewsBody, { ssr: false, loading: () => null });

/** Warm the manage-views body chunk on trigger intent or an idle pass. */
export function preloadEditViewsBody() {
  void loadChunk(loadEditViewsBody).catch(() => {});
}

interface EditViewsModalProps {
  opened: boolean;
  onClose: () => void;
  /** The account's tabs in strip order. */
  tabs: DashboardViewTab[];
  /** The tab currently rendered behind the modal. */
  activeView: DashboardViewTab;
  /** A list mutation landed (rename/reorder/non-active delete) — refresh. */
  onMutated: () => void;
  /** Patch one tab's definition (name/type) in the held snapshot so the strip
   *  and this list repaint instantly, before the follow-up re-read lands. */
  onApplyViewTab: (tab: DashboardViewTab) => void;
  /** Navigate to a tab (or the active tab's new kind after an edit). `force`
   *  forces a server re-read for a CRUD navigation whose tab list changed. */
  onNavigateToView: (
    tab: Pick<DashboardViewTab, "id" | "kind">,
    options?: { force?: boolean },
  ) => void;
  /** Switch to a tab and open its filter dialog (the Edit dialog's Filters). */
  onEditFilters: (tab: DashboardViewTab) => void;
  /** Open the quick "Add view" dialog (the strip's + flow). */
  onAddView: () => void;
  /** Reorder interaction (Settings → Feature Flags). */
  reorderDrag: ReorderDrag;
}

export function EditViewsModal({
  opened,
  onClose,
  tabs,
  activeView,
  onMutated,
  onApplyViewTab,
  onNavigateToView,
  onEditFilters,
  onAddView,
  reorderDrag,
}: EditViewsModalProps) {
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const isNarrow = useMediaQuery(NARROW_MEDIA_QUERY);
  const bodyReady = useChunkReady(loadEditViewsBody, opened);

  return (
    <MotionModal
      opened={opened}
      onClose={onClose}
      title="Manage views"
      centered
      size={isNarrow ? "xs" : isDesktop ? "md" : "sm"}
    >
      <CrossfadeSwap
        loading={opened && !bodyReady}
        minHoldMs={MIN_SKELETON_HOLD_MS}
        mode="overlay"
        skeleton={<FormModalSkeleton rows={4} label="Loading views" />}
      >
        <EditViewsModalBody
          onClose={onClose}
          tabs={tabs}
          activeView={activeView}
          onMutated={onMutated}
          onApplyViewTab={onApplyViewTab}
          onNavigateToView={onNavigateToView}
          onEditFilters={onEditFilters}
          onAddView={onAddView}
          reorderDrag={reorderDrag}
        />
      </CrossfadeSwap>
    </MotionModal>
  );
}
