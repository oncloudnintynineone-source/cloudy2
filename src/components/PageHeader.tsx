import { Stack, Text } from "@mantine/core";

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
}

/**
 * Shared page heading: a bold `lg` title with an optional dimmed subtitle
 * directly beneath it. Used by the list-style pages (Contacts, Double Booking,
 * KAH Status, Parade State) so every page opens with the same orientation
 * block instead of four hand-rolled header recipes.
 */
export function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <Stack gap={2}>
      <Text fw={600} size="lg" lineClamp={1}>
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
