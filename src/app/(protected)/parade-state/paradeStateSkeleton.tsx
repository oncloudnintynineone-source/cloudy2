import { Box, Paper, Skeleton, Stack } from "@mantine/core";

/** A department label plus user cards matching the page's content shape. */
export function ParadeStateDepartmentSkeleton({ users = 2 }: { users?: number }) {
  return (
    <Box>
      <Skeleton h={16} w={140} mb="xs" />
      <Stack gap="xs">
        {Array.from({ length: users }).map((_, userIdx) => (
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
  );
}
