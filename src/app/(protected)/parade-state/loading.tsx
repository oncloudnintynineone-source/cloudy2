import { Box, Group, Paper, Skeleton, Stack } from "@mantine/core";

export default function ParadeStateLoading() {
  return (
    <Stack gap="md" p="md" pb="xl">
      <Group align="center" gap="xs" wrap="nowrap">
        <Skeleton w={43} h={43} circle />
        <Skeleton h={24} style={{ flex: 1 }} />
        <Skeleton w={43} h={43} circle />
        <Skeleton w={43} h={43} circle />
      </Group>

      {Array.from({ length: 3 }).map((_, deptIdx) => (
        <Box key={deptIdx}>
          <Skeleton h={16} w={140} mb="xs" />
          <Stack gap="xs">
            {Array.from({ length: 2 + (deptIdx % 2) }).map((_, userIdx) => (
              <Paper key={userIdx} withBorder p="sm">
                <Stack gap={4}>
                  <Skeleton h={16} w={120 + (userIdx % 3) * 40} />
                  <Stack gap={4}>
                    {Array.from({ length: 1 + (userIdx % 2) }).map((_, evIdx) => (
                      <Skeleton
                        key={evIdx}
                        h={12}
                        style={{ width: `${60 + ((userIdx * 3 + evIdx) % 3) * 12}%` }}
                      />
                    ))}
                  </Stack>
                </Stack>
              </Paper>
            ))}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}
