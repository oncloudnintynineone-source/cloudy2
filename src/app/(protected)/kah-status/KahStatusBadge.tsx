"use client";

import { Badge, type BadgeProps } from "@mantine/core";

/** The semantic colours the KAH status labels use. */
type KahStatusColor = "red" | "yellow" | "green" | "orange";

/**
 * A small light-variant status badge with readable text in both schemes.
 *
 * Mantine's `light` variant draws its text from the palette's mid shade
 * (`--mantine-color-{color}-light-color`); measured on this surface that is
 * ~4.5:1 for red but only ~2.7:1 (yellow) and ~3.8:1 (green) — under the
 * 4.5:1 small-text floor. The lighter palette has no darker shade to fall back
 * to, so the text uses the scheme-aware `--mantine-color-text` while the tinted
 * fill keeps the semantic colour (every badge is also labelled in words, never
 * colour-only).
 */
export function KahStatusBadge({
  color,
  title,
  ...props
}: Omit<BadgeProps, "color" | "variant"> & { color: KahStatusColor; title?: string }) {
  return (
    <Badge
      {...props}
      title={title}
      variant="light"
      color={color}
      // Inline so it wins over the variant's `color: var(--badge-color)` rule.
      style={{ ...props.style, color: "var(--mantine-color-text)" }}
    />
  );
}
