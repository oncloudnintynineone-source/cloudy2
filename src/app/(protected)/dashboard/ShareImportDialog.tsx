"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { IconAlertTriangle, IconCircleCheck, IconShare } from "@tabler/icons-react";

import { CrossfadeSwap } from "@/components/CrossfadeSwap";
import { LoadingStatus } from "@/components/LoadingStatus";
import { MotionModal } from "@/components/MotionModal";
import {
  addSharedDashboardView,
  inspectSharedDashboardView,
  type SharedViewPreview,
} from "@/lib/dashboardViews/shareActions";
import type { DashboardViewKind } from "@/lib/dashboardViews/views";
import { MIN_SKELETON_HOLD_MS } from "@/lib/loading/minHoldLoading";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";

import { VIEW_TAB_META } from "./viewMeta";

interface ShareImportDialogProps {
  opened: boolean;
  token: string | null;
  onClose: () => void;
  onAdded: (tab: { id: string; kind: DashboardViewKind }) => void;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <Group align="flex-start" gap="xs" wrap="nowrap">
      <Text size="xs" c="dimmed" w={86} style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <Text size="sm" style={{ minWidth: 0, overflowWrap: "anywhere" }}>
        {value}
      </Text>
    </Group>
  );
}

function namesOr(names: string[], empty: string): string {
  if (names.length === 0) {
    return empty;
  }
  const head = names.slice(0, 6);
  const rest = names.length - head.length;
  return rest > 0 ? `${head.join(", ")} +${rest} more` : head.join(", ");
}

/**
 * Recipient side of a shared view link. Opens from `?share=<token>`, previews
 * the decoded definition (resolved against live calendars/users/types), and on
 * confirm appends an ordinary copy of the tab. The token is re-validated by the
 * add action; the preview is advisory only.
 */
export function ShareImportDialog({ opened, token, onClose, onAdded }: ShareImportDialogProps) {
  const [preview, setPreview] = useState<SharedViewPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  // Reset during render when a new link opens (the codebase's adjust-state
  // pattern), so a reopened dialog never shows the previous view's preview.
  const requestToken = opened ? token : null;
  const [activeToken, setActiveToken] = useState<string | null>(null);
  if (requestToken !== activeToken) {
    setActiveToken(requestToken);
    setPreview(null);
    setLoadingError(null);
    setAddError(null);
    setAdding(false);
    setLoading(requestToken !== null);
  }

  useEffect(() => {
    if (!opened || !token) {
      return;
    }
    let active = true;
    void (async () => {
      try {
        const result = await inspectSharedDashboardView(token);
        if (!active) return;
        if (result.ok) {
          setPreview(result.preview);
        } else {
          setLoadingError(result.error);
        }
      } catch {
        if (active) setLoadingError("Could not open this shared view");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [opened, token]);

  async function add() {
    if (!token || adding || !preview?.canAdd) {
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const result = await addSharedDashboardView(token);
      if (!result.ok) {
        setAddError(result.error);
        return;
      }
      onAdded({ id: result.id, kind: result.kind });
    } catch {
      setAddError("Could not add this shared view");
    } finally {
      setAdding(false);
    }
  }

  const kindMeta = preview ? VIEW_TAB_META[preview.kind] : null;

  return (
    <MotionModal opened={opened} onClose={onClose} title="Shared calendar view" centered size="sm">
      <CrossfadeSwap
        loading={loading}
        minHoldMs={MIN_SKELETON_HOLD_MS}
        mode="overlay"
        skeleton={
          <Stack gap="sm" aria-busy>
            <LoadingStatus label="Loading shared view" />
            <Skeleton height={28} width="70%" />
            <Skeleton height={14} width="45%" />
            <Skeleton height={52} />
            <Skeleton height={52} />
            <Skeleton height={36} width="60%" ml="auto" />
          </Stack>
        }
      >
        {loadingError !== null && (
          <Stack gap="md">
            <Alert color="red" icon={<IconAlertTriangle size={18} />} title="Link unavailable">
              {loadingError}
            </Alert>
            <Group justify="flex-end">
              <Button variant="default" onClick={onClose}>
                Close
              </Button>
            </Group>
          </Stack>
        )}

        {preview !== null && (
          <Stack gap="md">
            <Group gap="sm" wrap="nowrap" align="flex-start">
              <ThemeIcon variant="light" color="brand" size={40} radius="md">
                {kindMeta?.icon ?? <IconShare size={20} />}
              </ThemeIcon>
              <div style={{ minWidth: 0 }}>
                <Title order={5} style={{ overflowWrap: "anywhere" }}>
                  {preview.name}
                </Title>
                <Group gap={6} mt={2}>
                  <Badge variant="light" size="sm">
                    {preview.kindLabel}
                  </Badge>
                  {preview.sharedBy && (
                    <Text size="xs" c="dimmed" truncate>
                      Shared by {preview.sharedBy}
                    </Text>
                  )}
                </Group>
              </div>
            </Group>

            <Stack gap={6}>
              <SummaryRow
                label="Calendars"
                value={
                  preview.allCalendars
                    ? "All calendars"
                    : namesOr(preview.calendarNames, "No calendars")
                }
              />
              <SummaryRow label="Users" value={namesOr(preview.userNames, "Any user")} />
              <SummaryRow
                label="Event types"
                value={namesOr(preview.eventTypeNames, "Any event type")}
              />
            </Stack>

            {preview.missingFilterCount > 0 && (
              <Alert color="yellow" icon={<IconAlertTriangle size={18} />}>
                Some shared filters are no longer available and will be skipped.
              </Alert>
            )}

            {!preview.canAdd && (
              <Alert color="yellow" icon={<IconAlertTriangle size={18} />}>
                You have reached the {preview.viewLimit}-view limit. Delete a view before adding
                another.
              </Alert>
            )}

            {addError && (
              <Alert color="red" icon={<IconAlertTriangle size={18} />}>
                {addError}
              </Alert>
            )}

            <Group justify="flex-end" mt="xs">
              <Button variant="default" onClick={onClose} disabled={adding}>
                Cancel
              </Button>
              <Button
                leftSection={<IconCircleCheck size={16} />}
                onClick={() => void add()}
                loading={adding}
                loaderProps={BUTTON_LOADER_PROPS}
                disabled={!preview.canAdd}
              >
                Add view
              </Button>
            </Group>
          </Stack>
        )}
      </CrossfadeSwap>
    </MotionModal>
  );
}
