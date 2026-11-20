"use client";

import type { ReactNode } from "react";
import { Button, Group, Stack, Text } from "@mantine/core";

import { BUTTON_LOADER_PROPS } from "@/lib/theme";

import { MotionModal } from "./MotionModal";

export interface ConfirmModalProps {
  opened: boolean;
  onClose: () => void;
  title: string;
  /** Plain confirmation copy; use `children` for richer content. */
  message?: ReactNode;
  children?: ReactNode;
  confirmLabel?: string;
  /** Mantine color name for the confirm button (default red). */
  confirmColor?: string;
  confirmIcon?: ReactNode;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  size?: "xs" | "sm" | "md";
  withCloseButton?: boolean;
  zIndex?: number;
}

/**
 * The app's one destructive/action confirmation dialog: a small centered
 * `MotionModal` with Cancel + a confirm button that owns its loading state.
 * Callers keep their own busy flag (and `runConfirm` helper) around the async
 * action.
 */
export function ConfirmModal({
  opened,
  onClose,
  title,
  message,
  children,
  confirmLabel = "Delete",
  confirmColor = "red",
  confirmIcon,
  cancelLabel = "Cancel",
  loading = false,
  onConfirm,
  size = "sm",
  withCloseButton,
  zIndex,
}: ConfirmModalProps) {
  return (
    <MotionModal
      opened={opened}
      onClose={onClose}
      title={title}
      centered
      size={size}
      withCloseButton={withCloseButton}
      zIndex={zIndex}
    >
      <Stack gap="sm">
        {message !== undefined ? <Text>{message}</Text> : null}
        {children}
      </Stack>
      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onClose}>
          {cancelLabel}
        </Button>
        <Button
          color={confirmColor}
          loading={loading}
          loaderProps={BUTTON_LOADER_PROPS}
          leftSection={confirmIcon}
          onClick={() => void onConfirm()}
        >
          {confirmLabel}
        </Button>
      </Group>
    </MotionModal>
  );
}
