"use client";

import { useEffect, useState } from "react";
import { Alert, Button, CopyButton, Skeleton, Stack, Text, TextInput } from "@mantine/core";
import { IconAlertTriangle, IconCheck, IconCopy } from "@tabler/icons-react";

import { LoadingStatus } from "@/components/LoadingStatus";
import { MotionModal } from "@/components/MotionModal";
import { createDashboardViewShareLink } from "@/lib/dashboardViews/shareActions";
import type { DashboardViewTab } from "@/lib/dashboardViews/views";

interface ShareViewDialogProps {
  /** The saved tab to share; null keeps the dialog closed. */
  tab: DashboardViewTab | null;
  onClose: () => void;
}

/**
 * Sharer side of a shared view: turns one saved tab into a self-contained
 * `/share/<token>` link. The link is generated on open and can be copied
 * without any server-side share row to manage afterwards.
 */
export function ShareViewDialog({ tab, onClose }: ShareViewDialogProps) {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Reset derived state during render when the shared tab changes (the
  // codebase's adjust-state-during-render pattern), so a reopened dialog never
  // flashes the previous link while the new one is generated.
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  if ((tab?.id ?? null) !== activeTabId) {
    setActiveTabId(tab?.id ?? null);
    setLink(null);
    setError(null);
    setLoading(tab !== null);
  }

  useEffect(() => {
    if (!tab) {
      return;
    }
    let active = true;
    void (async () => {
      try {
        const result = await createDashboardViewShareLink(tab.id);
        if (!active) return;
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setLink(`${window.location.origin}/share/${result.token}`);
      } catch {
        if (active) setError("Could not create a share link");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [tab]);

  return (
    <MotionModal opened={tab !== null} onClose={onClose} title="Share view" centered size="sm">
      {loading && (
        <Stack gap="sm" aria-busy>
          <LoadingStatus label="Creating share link" />
          <Skeleton height={16} width="80%" />
          <Skeleton height={36} />
          <Skeleton height={14} width="60%" />
        </Stack>
      )}

      {!loading && error !== null && (
        <Stack gap="md">
          <Alert color="red" icon={<IconAlertTriangle size={18} />}>
            {error}
          </Alert>
        </Stack>
      )}

      {!loading && link !== null && (
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Anyone signed in who has this link can add a copy of{" "}
            <Text span fw={600} c="var(--mantine-color-text)">
              {tab?.name}
            </Text>
            .
          </Text>
          <TextInput
            label="Share link"
            value={link}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
            rightSectionWidth={96}
            rightSection={
              <CopyButton value={link} timeout={2000}>
                {({ copied, copy }) => (
                  <Button
                    size="compact-sm"
                    variant={copied ? "light" : "default"}
                    color={copied ? "teal" : undefined}
                    leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                    onClick={copy}
                  >
                    {copied ? "Copied" : "Copy"}
                  </Button>
                )}
              </CopyButton>
            }
          />
          <Text size="xs" c="dimmed">
            The link carries the view definition only; it does not grant access to any events.
          </Text>
        </Stack>
      )}
    </MotionModal>
  );
}
