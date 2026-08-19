import { Box, Group, Paper, Skeleton, Stack } from "@mantine/core";

export default function ParadeStateLoading() {
  return (
    <Stack gap="md" p="md">
      <Group justify="space-between">
        <Skeleton h={36} w={120} />
        <Group gap="xs">
          <Skeleton h={36} w={36} circle />
          <Skeleton h={24} w={100} />
          <Skeleton h={36} w={36} circle />
        </Group>
        <Skeleton h={36} w={80} />
      </Group>

      <Skeleton h={36} />

      {Array.from({ length: 3 }).map((_, deptIdx) => (
        <Box key={deptIdx}>
          <Skeleton h={20} w={140} mb="xs" />
          <Stack gap="xs">
            {Array.from({ length: 2 + (deptIdx % 2) }).map((_, userIdx) => (
              <Paper key={userIdx} withBorder p="sm">
                <Group gap="sm" wrap="nowrap">
                  <Skeleton h={16} w={100 + (userIdx % 3) * 30} />
                  <Box style={{ flex: 1 }}>
                    <Stack gap={4}>
                      {Array.from({ length: 1 + (userIdx % 2) }).map((_, evIdx) => (
                        <Group key={evIdx} gap="xs">
                          <Skeleton h={14} w={60 + (evIdx % 3) * 20} />
                          <Skeleton h={14} w={80 + (evIdx % 2) * 40} />
                        </Group>
                      ))}
                    </Stack>
                  </Box>
                </Group>
              </Paper>
            ))}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}
