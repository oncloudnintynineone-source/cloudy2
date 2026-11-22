import { Box, Group, Skeleton, Stack } from "@mantine/core";

import { LoadingStatus } from "@/components/LoadingStatus";
import { PageContainer } from "@/components/PageContainer";
import { PageHeaderSkeleton } from "@/components/PageHeader";

const LIST_BORDER = "1px solid var(--mantine-color-default-border)";

export default function ContactsLoading() {
  return (
    <PageContainer>
      <LoadingStatus label="Loading contacts" />
      <Stack pb="xl">
        <PageHeaderSkeleton />

        {/* Desktop: the sticky search/sort/filter/export bar. Below lg these
            move to the floating bottom pill, so the bar is desktop-only. */}
        <Box visibleFrom="lg" py="md">
          <Group justify="space-between" wrap="nowrap" gap="sm">
            <Skeleton height={43} style={{ flex: 1 }} />
            <Skeleton width={110} height={43} radius="sm" />
            <Skeleton width={43} height={43} radius="sm" />
            <Skeleton width={128} height={43} radius="sm" />
          </Group>
        </Box>

        {/* The sectioned dense row list (C2): one rounded card per group, each
            with a hairline-separated set of rows — name line + phone/chips line
            + the two action circles. The rows ride the same `.c2-contact-rows`
            columns as the loaded page, so the skeleton→content swap does not
            reflow. */}
        <Stack gap="sm">
          {[2, 3].map((rows, groupIndex) => (
            <Box
              key={groupIndex}
              className="c2-contact-section"
              style={{
                border: LIST_BORDER,
                borderRadius: "var(--mantine-radius-md)",
                overflow: "hidden",
              }}
            >
              <Box
                style={{
                  padding: "6px var(--mantine-spacing-sm)",
                  borderBottom: LIST_BORDER,
                }}
              >
                <Skeleton height={10} width={12} />
              </Box>
              <Box component="div" className="c2-contact-rows">
                {Array.from({ length: rows }).map((_, i) => (
                  <Box
                    key={i}
                    className="c2-contact-row"
                    style={{ padding: "10px var(--mantine-spacing-sm)" }}
                  >
                    <Group justify="space-between" wrap="nowrap" gap="sm">
                      <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
                        <Skeleton height={16} width="45%" />
                        <Group gap={6}>
                          <Skeleton height={12} width={70} />
                          <Skeleton height={16} width={48} radius="xl" />
                          <Skeleton height={16} width={64} radius="xl" />
                        </Group>
                      </Stack>
                      <Group gap={6} wrap="nowrap">
                        <Skeleton width={36} height={36} radius="xl" />
                        <Skeleton width={36} height={36} radius="xl" />
                      </Group>
                    </Group>
                  </Box>
                ))}
              </Box>
            </Box>
          ))}
        </Stack>
      </Stack>
    </PageContainer>
  );
}
