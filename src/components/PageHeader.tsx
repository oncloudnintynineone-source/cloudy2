import { Skeleton, Stack, Text } from "@mantine/core";

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
}

interface PageHeaderSkeletonProps {
  /** Line width for the title block (defaults to a typical page title). */
  titleWidth?: string;
  /** Line width for the subtitle block; omit the subtitle entirely when false. */
  subtitleWidth?: string | false;
}

/**
 * Shared page heading: a bold `lg` title with an optional dimmed subtitle
 * directly beneath it. Used by the list-style pages (Contacts, Double Booking,
 * KAH Status, Parade State, My Events) so every page opens with the same
 * orientation block instead of four hand-rolled header recipes.
 *
 * The title is the page's **`h1`** (docs/accessibility.md §1.10): every page
 * needs a document heading for the outline a screen reader or a "skip to
 * heading" jump relies on, and the sections beneath it (`h2` and down) only
 * nest correctly from one. `m={0}` is load-bearing — Mantine ships no heading
 * reset, so the UA's own `h1` margins would otherwise add ~22px above and below
 * a title that must keep the block's exact metrics.
 */
export function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <Stack gap={2}>
      <Text component="h1" m={0} fw={600} size="lg" lineClamp={1}>
        {title}
      </Text>
      {subtitle ? (
        <Text fz="sm" c="dimmed">
          {subtitle}
        </Text>
      ) : null}
    </Stack>
  );
}

/**
 * Route-loading mirror of `PageHeader`. Kept beside the real header so the
 * fallback's two lines (same 2px gap, matching the `lg` title / `sm` subtitle
 * metrics) can't drift from the content it stands in for.
 */
export function PageHeaderSkeleton({
  titleWidth = "40%",
  subtitleWidth = "65%",
}: PageHeaderSkeletonProps) {
  return (
    <Stack gap={2} aria-hidden>
      <Skeleton height={28} width={titleWidth} radius="sm" />
      {subtitleWidth === false ? null : <Skeleton height={20} width={subtitleWidth} radius="sm" />}
    </Stack>
  );
}
