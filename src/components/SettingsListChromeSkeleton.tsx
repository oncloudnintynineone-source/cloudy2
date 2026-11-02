import { Box, Group, Skeleton } from "@mantine/core";

interface SettingsListChromeSkeletonProps {
  /** Whether the real chrome shows a filter button (Users only). */
  showFilter?: boolean;
  /** Desktop action-button widths, in px. */
  actionWidths?: number[];
}

/**
 * Route-loading mirror of `SettingsListChrome`'s desktop rail. The mobile pill
 * is portaled and appears once the page boots, so the fallback only paints the
 * `lg`+ search/action row. Deliberately not sticky: the settings tab strip is
 * JS-gated to `lg`, so its measured height (and the real bar's dock offset)
 * only exists after hydration.
 */
export function SettingsListChromeSkeleton({
  showFilter = false,
  actionWidths = [104],
}: SettingsListChromeSkeletonProps) {
  return (
    <Box
      className="c2-glass-surface"
      visibleFrom="lg"
      style={{
        borderBottom: "1px solid var(--mantine-color-default-border)",
        paddingBlock: "var(--mantine-spacing-md)",
      }}
    >
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Skeleton height={43} style={{ flex: 1 }} />
        {showFilter && <Skeleton width={43} height={43} radius="sm" />}
        {actionWidths.map((width, index) => (
          <Skeleton key={index} width={width} height={43} />
        ))}
      </Group>
    </Box>
  );
}
