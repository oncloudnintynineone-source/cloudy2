"use client";

import { useMediaQuery } from "@mantine/hooks";
import dynamic from "next/dynamic";

import type { Calendar } from "@/db/schema";
import { CrossfadeSwap } from "@/components/CrossfadeSwap";
import { FormModalSkeleton } from "@/components/FormModalSkeleton";
import { MotionModal } from "@/components/MotionModal";
import { useChunkReady } from "@/lib/loading/chunkReady";
import { MIN_SKELETON_HOLD_MS } from "@/lib/loading/minHoldLoading";
import { DESKTOP_MEDIA_QUERY } from "@/lib/theme";

// The department form + access manager is large and only mounted on tap; it
// lives in its own chunk (`DepartmentDetailBody`). The chrome stays static so
// the dialog zooms out of the tapped row instantly and the chunk skeleton
// dissolves inside the open dialog instead of replacing the whole modal.
const loadDepartmentDetailBody = () =>
  import("./DepartmentDetailBody").then((mod) => mod.DepartmentDetailBody);
const DepartmentDetailBody = dynamic(loadDepartmentDetailBody, {
  ssr: false,
  loading: () => null,
});

interface DepartmentDetailProps {
  /** The department to manage; null opens the create flow. */
  calendar: Calendar | null;
  /** Every department — source of the parent-department options. */
  departments: Calendar[];
  opened: boolean;
  onClose: () => void;
  /** After an existing department is saved: update its list row in place. */
  onSaved: (calendar: Calendar) => void;
  /** After a new department is created: close and refresh the list. */
  onCreate: () => void;
  /** Ask the parent to show the delete confirmation for this department. */
  onRequestDelete: (calendar: Calendar) => void;
}

export function DepartmentDetail({
  calendar,
  departments,
  opened,
  onClose,
  onSaved,
  onCreate,
  onRequestDelete,
}: DepartmentDetailProps) {
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);
  const bodyReady = useChunkReady(loadDepartmentDetailBody, opened);
  return (
    <MotionModal
      opened={opened}
      onClose={onClose}
      title={calendar ? "Edit department" : "Add department"}
      centered
      size={isDesktop ? "lg" : "md"}
    >
      <CrossfadeSwap
        loading={opened && !bodyReady}
        minHoldMs={MIN_SKELETON_HOLD_MS}
        mode="overlay"
        skeleton={<FormModalSkeleton rows={5} />}
      >
        {/* Keyed per department: the body (form state + access data) is
            remounted fresh on every open and seeded from the tapped row; the
            key also covers a target switch while the modal is still mounted. */}
        <DepartmentDetailBody
          key={calendar?.id ?? "new"}
          calendar={calendar}
          departments={departments}
          onSaved={onSaved}
          onCreate={onCreate}
          onRequestDelete={onRequestDelete}
        />
      </CrossfadeSwap>
    </MotionModal>
  );
}
