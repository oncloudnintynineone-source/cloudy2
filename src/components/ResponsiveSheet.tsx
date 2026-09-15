"use client";

import { Box, Modal, type ModalProps } from "@mantine/core";
import { useDrag, useMediaQuery } from "@mantine/hooks";
import { useRef } from "react";

import { MOTION } from "@/lib/motion/timing";
import { DESKTOP_MEDIA_QUERY } from "@/lib/theme";
import { sheetDragOffset, shouldDismissSheet } from "@/lib/ui/sheetDrag";

/**
 * The app's shared dialog surface (docs/native-feel.md).
 *
 * On desktop (>= lg) it is the unchanged Mantine `Modal` — centered, with the
 * caller's zoom-from-origin transition. On mobile it becomes a **bottom sheet**:
 * anchored to the bottom edge, full-width, rounded top corners, a drag handle,
 * and drag-to-dismiss — the platform-native presentation instead of a
 * centered web dialog.
 *
 * The public API is the `Modal` API, so a call site migrates by swapping the
 * import and the tag. `fullHeight` and `dismissible` are the only mobile-only
 * knobs; both are stripped before the desktop `Modal` is rendered.
 */

export interface ResponsiveSheetProps extends ModalProps {
  /**
   * Mobile only: grow the sheet to fill most of the viewport (list/form
   * sheets). Desktop ignores it.
   */
  fullHeight?: boolean;
  /** Mobile only: disable drag-to-dismiss (e.g. a sheet with a fixed body). */
  dismissible?: boolean;
}

/** Rounded top only — the sheet meets the bottom edge flush. */
const SHEET_RADIUS = "var(--mantine-radius-lg) var(--mantine-radius-lg) 0 0";

export function ResponsiveSheet({
  fullHeight = false,
  dismissible = true,
  centered = false,
  transitionProps,
  styles,
  title,
  withCloseButton = true,
  withOverlay = true,
  overlayProps,
  closeButtonProps,
  radius,
  size,
  zIndex,
  keepMounted,
  classNames,
  className,
  children,
  opened,
  onClose,
  ...rest
}: ResponsiveSheetProps) {
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);
  const contentRef = useRef<HTMLDivElement>(null);

  // Mobile drag-to-dismiss. Attached to the handle only, so scrolling the
  // sheet body is never captured. The transform is written straight to the DOM
  // (never React state) so the sheet tracks the finger 1:1; a `c2-sheet-dragging`
  // class kills the transition while the finger is down.
  const { ref: handleRef } = useDrag<HTMLDivElement>(
    (state) => {
      const el = contentRef.current;
      if (!el) return;
      if (state.first) el.classList.add("c2-sheet-dragging");
      if (!state.last) {
        el.style.transform = `translateY(${sheetDragOffset(state.movement[1])}px)`;
        return;
      }
      el.classList.remove("c2-sheet-dragging");
      el.style.transform = "";
      if (
        dismissible &&
        !state.canceled &&
        shouldDismissSheet({
          movementY: sheetDragOffset(state.movement[1]),
          velocityY: state.velocity[1],
          height: el.offsetHeight,
        })
      ) {
        onClose();
      }
    },
    { axis: "y", filterTaps: true, enabled: !isDesktop && dismissible },
  );

  if (isDesktop) {
    return (
      <Modal
        opened={opened}
        onClose={onClose}
        title={title}
        withCloseButton={withCloseButton}
        withOverlay={withOverlay}
        overlayProps={overlayProps}
        closeButtonProps={closeButtonProps}
        radius={radius}
        size={size}
        zIndex={zIndex}
        keepMounted={keepMounted}
        centered={centered}
        transitionProps={transitionProps}
        styles={styles}
        classNames={classNames}
        className={className}
        {...rest}
      >
        {children}
      </Modal>
    );
  }

  const hasHeader = Boolean(title) || withCloseButton;
  const baseStyles = (typeof styles === "function" ? {} : (styles ?? {})) as Record<
    string,
    Record<string, unknown> | undefined
  >;
  const sheetStyles = {
    ...baseStyles,
    inner: {
      // Set the var as well as the property so the base rule's
      // `align-items: var(--modal-inner-align, flex-start)` bottoms out too.
      "--modal-inner-align": "flex-end",
      alignItems: "flex-end",
      paddingTop: 0,
      paddingBottom: 0,
      paddingInline: 0,
      ...baseStyles.inner,
    },
    content: {
      // `flex` beats Mantine's `.m_54c44539` (`flex: 0 0 var(--modal-size)`);
      // without it a definite flex-basis wins over `width`, so the sheet would
      // render as a centered `--modal-size` card on 440–639px viewports.
      flex: "0 0 100%",
      width: "100%",
      maxWidth: "100%",
      maxHeight: "92dvh",
      height: fullHeight ? "92dvh" : undefined,
      borderRadius: SHEET_RADIUS,
      marginBottom: 0,
      ...baseStyles.content,
    },
    body: {
      // Clear the gesture bar / home indicator at the sheet's foot.
      paddingBottom: "calc(var(--mantine-spacing-md) + env(safe-area-inset-bottom))",
      ...baseStyles.body,
    },
  } as ModalProps["styles"];

  return (
    <Modal.Root
      opened={opened}
      onClose={onClose}
      zIndex={zIndex}
      keepMounted={keepMounted}
      radius={radius}
      size={size}
      centered={false}
      yOffset="4dvh"
      transitionProps={{ transition: "slide-up", duration: MOTION.modalZoom }}
      styles={sheetStyles}
      classNames={classNames}
      className={className}
      {...rest}
    >
      {withOverlay && <Modal.Overlay {...overlayProps} />}
      <Modal.Content ref={contentRef} className="c2-sheet-content">
        {dismissible && (
          <Box ref={handleRef} className="c2-sheet-handle" aria-hidden role="presentation" />
        )}
        {hasHeader && (
          <Modal.Header>
            {title && <Modal.Title>{title}</Modal.Title>}
            {withCloseButton && <Modal.CloseButton {...closeButtonProps} />}
          </Modal.Header>
        )}
        <Modal.Body>{children}</Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
