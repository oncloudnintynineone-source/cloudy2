"use client";

import { Badge, Box, Group, ScrollArea, Stack, Text } from "@mantine/core";
import { usePathname } from "next/navigation";

import { MotionModal } from "@/components/MotionModal";
import {
  GUIDE_SECTIONS,
  guideSectionIdForPath,
  orderGuideSections,
} from "@/lib/help/guideContent";
import { AUTOSIZE_VERTICAL_SCROLL_PROPS } from "@/lib/ui/scrollArea";

interface GuideSheetProps {
  opened: boolean;
  onClose: () => void;
}

/**
 * The in-app Guide (docs/ui-ux-improvements.md D2): one short "what this page
 * is for" block per route, rendered from the typed content module
 * (`src/lib/help/guideContent.ts`) — never a fork of the user guide's prose.
 * The block for the page you are on leads and carries a "This page" badge.
 *
 * Opened from the profile menu (reachable at every width, the shell header is
 * never hidden) and from the "?" in the dashboard's wide toolbar.
 */
export function GuideSheet({ opened, onClose }: GuideSheetProps) {
  const pathname = usePathname();
  const currentId = guideSectionIdForPath(GUIDE_SECTIONS, pathname ?? "");
  const sections = orderGuideSections(GUIDE_SECTIONS, currentId);

  return (
    <MotionModal opened={opened} onClose={onClose} title="Guide" centered size="sm">
      <ScrollArea.Autosize
        {...AUTOSIZE_VERTICAL_SCROLL_PROPS}
        mah="min(65vh, 480px)"
        mx="-md"
        px="md"
      >
        <Stack gap="lg" pb="xs">
          {sections.map((section) => (
            <Box key={section.id}>
              <Group gap="xs" wrap="nowrap">
                <Text fw={700}>{section.title}</Text>
                {section.id === currentId && (
                  <Badge size="xs" variant="light" color="brand">
                    This page
                  </Badge>
                )}
              </Group>
              <Text size="sm" c="dimmed" mt={2}>
                {section.summary}
              </Text>
              <Stack gap={4} mt="xs">
                {section.points.map((point) => (
                  <Text key={point} size="sm" ps="md" style={{ textIndent: "-1em" }}>
                    • {point}
                  </Text>
                ))}
              </Stack>
            </Box>
          ))}
          <Text size="xs" c="dimmed">
            Quick orientation only — your admin has the full user guide.
          </Text>
        </Stack>
      </ScrollArea.Autosize>
    </MotionModal>
  );
}
