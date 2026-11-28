"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Badge, Group, Popover, UnstyledButton } from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";

import { useMotion } from "@/components/MotionProvider";
import { popoverTransitionProps } from "@/lib/motion/transitions";

/** Above the app's modals (200) so a chip's popup never hides behind one. */
export const CHIP_POPOVER_Z_INDEX = 300;

export interface ChipPopoverProps {
  /** The chip's visible content (the group name, plus any count the caller bakes in). */
  label: ReactNode;
  /** The trigger's accessible name — spell out the state, not just the label. */
  ariaLabel: string;
  /** Accessible name for the popup region ("Logistics options"). */
  optionsLabel: string;
  /**
   * Surface skin: the class the surface's own CSS targets (e.g.
   * `c2-event-type-group-tile`, `c2-filter-group-chip`). It carries that
   * surface's fill/border/state styling; this component only owns the geometry.
   */
  badgeClassName?: string;
  /** `data-selected` — the all-in state of the group the chip stands for. */
  selected?: boolean;
  /** `data-partial` — some, not all, of the group is chosen. */
  partial?: boolean;
  /** Popup width ceiling in px. */
  dropdownMaxWidth?: number;
  /**
   * Keep the chip's label on one line (ellipsised). The wizard's type step does;
   * the filter dialog's department names wrap inside the chip instead, so a long
   * department is never truncated to an ellipsis nobody can read.
   */
  labelNowrap?: boolean;
  /**
   * Move focus to the popup's first chip when it opens. Off by default because
   * the wizard's type step has always left focus on the trigger; the filter
   * dialog opts in so its popups are keyboard-reachable without extra Tabs.
   */
  focusOnOpen?: boolean;
  /** Called with the new open state before the popup animates. */
  onOpenChange?: (open: boolean) => void;
  /**
   * Controlled open state. Omit to let the chip own it (the filter dialog does);
   * the wizard's single-select tile controls it so a pick can close the popup.
   */
  open?: boolean;
  children: ReactNode;
}

/**
 * The app's **group chip**: a content-width container chip whose popup holds the
 * chips of the things grouped under it (one event-type group's types, one
 * department's users). Two surfaces render through it — the wizard's type step
 * (`EventTypeGroupGrid`) and the filter dialog's sectioned panels — so the
 * mechanic cannot drift between them: same trigger semantics
 * (`aria-haspopup`/`aria-expanded`), same chevron that flips with the popup,
 * same `popoverTransitionProps(useMotion())` cadence, same above-the-modal
 * z-index, same focus handoff (open → first chip in the popup, close → back to
 * the chip) and the same wrapped `Group` body.
 *
 * The skin stays the caller's: a **container** chip must not read like one of
 * the selectable chips inside it, so each surface passes its own class and state
 * attributes. The trigger itself is never `aria-pressed` — it opens a list, it
 * does not select anything; the pick lives in the chips inside.
 */
export function ChipPopover({
  label,
  ariaLabel,
  optionsLabel,
  badgeClassName,
  selected = false,
  partial = false,
  dropdownMaxWidth = 280,
  labelNowrap = true,
  focusOnOpen = false,
  onOpenChange,
  open: controlledOpen,
  children,
}: ChipPopoverProps) {
  const motion = useMotion();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  function change(next: boolean) {
    if (controlledOpen === undefined) {
      setUncontrolledOpen(next);
    }
    if (next && focusOnOpen) {
      // Focus the first chip, so a keyboard user lands inside the popup instead
      // of having to Tab through the trigger again. The portalled popup mounts a
      // frame or two after the click, so this retries across two frames (a single
      // rAF can run before the dropdown ref is attached).
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          dropdownRef.current?.querySelector<HTMLElement>("button")?.focus();
        });
      });
    } else if (!next && dropdownRef.current?.contains(document.activeElement)) {
      // Closing from inside the popup hands focus back to the chip it belongs to
      // (never steals it when the user clicked somewhere else entirely).
      triggerRef.current?.focus();
    }
    onOpenChange?.(next);
  }

  /**
   * Escape closes this layer, and only this layer.
   *
   * Mantine's Popover *and* the host modal both listen for Escape on
   * `document`, so an unguarded Escape closed the popup **and** stepped the
   * filter dialog back a level — which reads as a lost panel. The guard is
   * registered on `document` in the **capture** phase while the popup is open,
   * so it runs before either of those listeners and stops the event there;
   * this component then closes itself.
   */
  const changeRef = useRef(change);
  useEffect(() => {
    // Written in an effect, never during render (React reads this only from the
    // document keydown handler below).
    changeRef.current = change;
  });
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.stopPropagation();
      event.preventDefault();
      changeRef.current(false);
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open]);

  return (
    <Popover
      opened={open}
      onChange={change}
      position="bottom"
      withArrow
      shadow="md"
      radius="md"
      zIndex={CHIP_POPOVER_Z_INDEX}
      transitionProps={popoverTransitionProps(motion)}
    >
      <Popover.Target>
        <UnstyledButton
          ref={triggerRef}
          onClick={() => change(!open)}
          aria-haspopup="true"
          aria-expanded={open}
          aria-label={ariaLabel}
          style={{
            cursor: "pointer",
            borderRadius: "var(--mantine-radius-md)",
            maxWidth: "100%",
          }}
        >
          <Badge
            size="lg"
            variant="outline"
            className={badgeClassName}
            data-selected={selected ? "true" : undefined}
            data-partial={partial ? "true" : undefined}
            aria-hidden
            style={{
              gap: 6,
              height: "auto",
              minHeight: "var(--c2-chip-height)",
              paddingBlock: 4,
              maxWidth: "100%",
            }}
          >
            <span
              style={{
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: labelNowrap ? "nowrap" : "normal",
                lineHeight: labelNowrap ? undefined : 1.25,
                textAlign: labelNowrap ? undefined : "center",
              }}
            >
              {label}
            </span>
            <IconChevronDown
              size={14}
              aria-hidden
              style={{
                flexShrink: 0,
                transform: open ? "rotate(180deg)" : undefined,
                transition: `transform ${motion.duration.micro}ms ${motion.easing.out}`,
              }}
            />
          </Badge>
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown aria-label={optionsLabel} ref={dropdownRef}>
        <Group gap={6} wrap="wrap" maw={dropdownMaxWidth}>
          {children}
        </Group>
      </Popover.Dropdown>
    </Popover>
  );
}
