"use client";

import { useCallback, useState } from "react";
import { useDisclosure } from "@mantine/hooks";

/**
 * The open/target state behind a settings entity modal: `opened` drives the
 * dialog, `editing` is the row being edited (null = create). Closing clears the
 * target so the next open remounts the form with fresh initial values.
 */
export function useEntityEditor<Row>() {
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<Row | null>(null);

  const openCreate = useCallback(() => {
    setEditing(null);
    open();
  }, [open]);

  const openEdit = useCallback(
    (row: Row) => {
      setEditing(row);
      open();
    },
    [open],
  );

  const closeEditor = useCallback(() => {
    close();
    setEditing(null);
  }, [close]);

  return { opened, editing, openCreate, openEdit, closeEditor };
}
