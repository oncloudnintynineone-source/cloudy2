import type { ScrollAreaAutosizeProps } from "@mantine/core";

/**
 * Shared props for the vertical lists built on `ScrollArea.Autosize`.
 *
 * Mantine v9's Autosize variant sets `min-width: min-content` on its content
 * element. With single-line (`truncate`) rows that min-content width is the
 * full unbroken text, so the content grows past the viewport and a horizontal
 * scrollbar appears instead of the title ellipsizing. Pinning the content back
 * to the viewport width (`minWidth: 0`) restores truncation; `scrollbars: "y"`
 * keeps the list vertical-only.
 *
 * Spread this on every `ScrollArea.Autosize` whose rows are meant to truncate.
 */
export const AUTOSIZE_VERTICAL_SCROLL_PROPS: Pick<
  ScrollAreaAutosizeProps,
  "scrollbars" | "styles"
> = {
  scrollbars: "y",
  styles: { content: { minWidth: 0 } },
};
