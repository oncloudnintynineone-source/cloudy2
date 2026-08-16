import { Paper, Skeleton, Stack } from "@mantine/core";

export default function DepartmentsLoading() {
  return (
    <Stack pb="xl" gap="sm">
      {Array.from({ length: 4 }).map((_, i) => (
        <Paper key={i} withBorder p="sm">
          <Stack gap="xs">
            <Skeleton height={20} width="40%" />
            <Skeleton height={16} width="80%" />
            <Skeleton height={24} width="30%" style={{ alignSelf: "flex-end" }} />
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}
