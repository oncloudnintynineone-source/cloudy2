"use client";

import type { ReactNode } from "react";
import { Button, Group } from "@mantine/core";

import { BUTTON_LOADER_PROPS } from "@/lib/theme";

export interface FormFooterActionsProps {
  /** Delete / status / cancel control shown before the submit button. */
  secondary?: ReactNode;
  submitLabel: string;
  isEdit: boolean;
  loading: boolean;
  /** Make the create-mode submit full width (the simple entity forms). */
  fullWidthOnCreate?: boolean;
}

/**
 * The shared bottom action row of a settings entity form: optional secondary
 * control, then a submit button that owns the loading state.
 */
export function FormFooterActions({
  secondary,
  submitLabel,
  isEdit,
  loading,
  fullWidthOnCreate = false,
}: FormFooterActionsProps) {
  return (
    <Group justify="flex-end" mt="md" wrap="nowrap">
      {secondary}
      <Button
        type="submit"
        fullWidth={fullWidthOnCreate && !isEdit}
        loading={loading}
        loaderProps={BUTTON_LOADER_PROPS}
      >
        {submitLabel}
      </Button>
    </Group>
  );
}
