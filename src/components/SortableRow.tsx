"use client";

import { type ReactNode } from "react";
import { ActionIcon, Tooltip } from "@mantine/core";
import { IconGripVertical } from "@tabler/icons-react";
import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";

import { ROW_ACTION_ICON_SIZE, ROW_ACTION_SIZE } from "@/components/reorderUpDown";
import { resolveDragMove } from "@/lib/ui/reorderRows";

/**
 * Shared drag-to-reorder plumbing (Settings → Feature Flags: `reorderDrag`).
 *
 * `SortableList` wraps one rendered list in a `DragDropProvider` and turns a
 * completed drop into a `(id, toIndex)` callback. `SortableRow` is the per-row
 * component (it must be a component, not a hook call inside `.map`, to obey the
 * Rules of Hooks) and renders through a function child so each surface can
 * attach the ref to its own element (`Paper`, `Table.Tr`, …). `DragHandle` is
 * the grip the user actually drags.
 *
 * Drag is purely additive: the up/down chevrons (`ReorderUpDown`) stay as the
 * keyboard/screen-reader alternative, and passing `enabled={false}` (the
 * flag's default) leaves the surface exactly as it was.
 */

interface SortableListProps {
  /** Current display keys, in order. */
  keys: readonly string[];
  /** Completed drop → move the row to `toIndex`. */
  onMove: (id: string, toIndex: number) => void;
  children: ReactNode;
}

/** One `DragDropProvider` per rendered list (each mobile/desktop twin has its
 *  own). Cheap and inert until a `DragHandle` is dragged. */
export function SortableList({ keys, onMove, children }: SortableListProps) {
  const handleDragEnd = (event: DragEndEvent) => {
    const move = resolveDragMove(keys, event);
    if (move) {
      onMove(move.id, move.toIndex);
    }
  };
  return <DragDropProvider onDragEnd={handleDragEnd}>{children}</DragDropProvider>;
}

export interface SortableRowRender {
  /** Attach to the row element. */
  ref: (element: Element | null) => void;
  /** The drag handle, or null when drag is disabled. */
  handle: ReactNode;
  isDragging: boolean;
}

interface SortableRowProps {
  id: string;
  index: number;
  /** Accessible name for the drag handle (usually the row label). */
  name: string;
  enabled: boolean;
  children: (parts: SortableRowRender) => ReactNode;
}

export function SortableRow({ id, index, name, enabled, children }: SortableRowProps) {
  const { ref, handleRef, isDragging } = useSortable({
    id,
    index,
    disabled: !enabled,
  });
  const handle = enabled ? <DragHandle handleRef={handleRef} name={name} /> : null;
  return <>{children({ ref, handle, isDragging })}</>;
}

interface DragHandleProps {
  handleRef: (element: Element | null) => void;
  name: string;
}

/** The grip. `touch-action: none` lets the pointer sensor start a drag on
 *  touch instead of scrolling; click propagation is stopped so a handle tap
 *  never triggers the row's own open/edit handler. */
export function DragHandle({ handleRef, name }: DragHandleProps) {
  return (
    <Tooltip label="Drag to reorder" position="top">
      <ActionIcon
        ref={handleRef}
        variant="subtle"
        color="gray"
        size={ROW_ACTION_SIZE}
        aria-label={`Drag ${name} to reorder`}
        onClick={(event) => event.stopPropagation()}
        style={{ cursor: "grab", touchAction: "none" }}
      >
        <IconGripVertical size={ROW_ACTION_ICON_SIZE} />
      </ActionIcon>
    </Tooltip>
  );
}
