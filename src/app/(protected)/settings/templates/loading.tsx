import { Group, Paper, Skeleton, Stack } from "@mantine/core";

function TemplateCardSkeleton({ previewRows }: { previewRows: number }) {
  return (
    <Paper withBorder p="sm">
      <Stack gap="sm">
        <Skeleton height={20} width="45%" />
        <Skeleton height={12} />
        <Skeleton height={12} width="85%" />
        <Skeleton height={12} width="25%" />
        <Skeleton height={36} />
        <Skeleton height={12} width="70%" />
        <Group gap={6}>
          <Skeleton height={12} width={44} />
          <Skeleton height={26} width={56} radius={6} />
          <Skeleton height={26} width={72} radius={6} />
          <Skeleton height={26} width={64} radius={6} />
        </Group>
        <Skeleton height={1} />
        <Skeleton height={12} width="30%" />
        <Stack gap={8}>
          {Array.from({ length: previewRows }).map((_, i) => (
            <Group key={i} justify="space-between" wrap="nowrap">
              <Skeleton height={14} width="35%" />
              <Skeleton height={14} width="45%" />
            </Group>
          ))}
        </Stack>
        <Group justify="flex-end">
          <Skeleton height={36} width={96} radius={6} />
        </Group>
      </Stack>
    </Paper>
  );
}

export default function TemplatesLoading() {
  return (
    <Stack>
      <TemplateCardSkeleton previewRows={3} />
      <TemplateCardSkeleton previewRows={2} />
    </Stack>
  );
}
