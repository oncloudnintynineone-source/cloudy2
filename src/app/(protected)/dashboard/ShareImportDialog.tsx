"use client";

import dynamic from "next/dynamic";

import { LazyModal } from "@/components/LazyModal";
import { useChunkReady } from "@/lib/loading/chunkReady";
import type { DashboardViewKind } from "@/lib/dashboardViews/views";

import { ShareImportSkeleton } from "./ShareImportSkeleton";

// The preview/actions body is only needed when a `?share=` link opens the
// dialog. The chrome stays static so the dialog launches immediately and the
// chunk skeleton dissolves inside it (docs/loading-transitions.md §1.15.1).
const loadShareImportBody = () =>
  import("./ShareImportDialogBody").then((mod) => mod.ShareImportDialogBody);
const ShareImportDialogBody = dynamic(loadShareImportBody, {
  ssr: false,
  loading: () => null,
});

interface ShareImportDialogProps {
  opened: boolean;
  token: string | null;
  onClose: () => void;
  onAdded: (tab: { id: string; kind: DashboardViewKind }) => void;
}

export function ShareImportDialog({ opened, token, onClose, onAdded }: ShareImportDialogProps) {
  const bodyReady = useChunkReady(loadShareImportBody, opened);

  return (
    <LazyModal
      opened={opened}
      onClose={onClose}
      title="Shared calendar view"
      size="sm"
      ready={bodyReady}
      skeleton={<ShareImportSkeleton />}
    >
      <ShareImportDialogBody token={token} onClose={onClose} onAdded={onAdded} />
    </LazyModal>
  );
}
