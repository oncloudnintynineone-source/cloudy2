"use client";

import { useCallback, useState } from "react";
import { SegmentedControl, Skeleton, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";

import { InlineError } from "@/components/InlineError";
import { clearAllDashboardSnapshots } from "@/lib/dashboard/localStore";
import type { WeekStart } from "@/lib/events/datetime";
import { useOpenQuery } from "@/lib/loading/useOpenQuery";
import { getWeekStart, setWeekStart } from "@/lib/userPrefs/actions";
import { MotionModal } from "@/components/MotionModal";
import { useMotion } from "@/components/MotionProvider";
import { fadeTransitionProps } from "@/lib/motion/transitions";

interface PreferencesModalProps {
  opened: boolean;
  onClose: () => void;
}

const mapWeekStartError = () => "Couldn't load your preference.";

/**
 * Profile-menu dialog for account-wide preferences that follow the user across
 * devices. Currently one: which day the calendar week starts on, which every
 * week/month dashboard grid honors. Saving reloads the page so the grids and
 * their fetch sets rebuild with the new first day.
 */
export function PreferencesModal({ opened, onClose }: PreferencesModalProps) {
  const motion = useMotion();
  const [busy, setBusy] = useState(false);
  const query = useOpenQuery<WeekStart>({
    enabled: opened,
    load: getWeekStart,
    mapError: mapWeekStartError,
  });
  const value = query.data;
  const { setData } = query;

  const handleChange = useCallback(
    async (next: string) => {
      if (next !== "monday" && next !== "sunday") return;
      setData(next);
      setBusy(true);
    try {
      const result = await setWeekStart(next);
      if (!result.ok) {
        notifications.show({ color: "red", message: result.error });
        setBusy(false);
        return;
      }
      // Drop the device-local snapshots so a stale record (built with the old
      // week start, and whose request key the client would treat as already
      // covered) can't paint and suppress the re-read, then reload so every
      // week/month grid rebuilds with the new first day.
      try {
        await clearAllDashboardSnapshots();
      } catch (error) {
        console.error("[prefs] Failed to clear dashboard snapshots", error);
      }
      window.location.reload();
    } catch (error) {
      console.error("[prefs] Failed to save week start", error);
      notifications.show({
        color: "red",
        message: "Couldn't save your preference — check your connection and try again.",
      });
      setBusy(false);
    }
  }, [setData]);

  return (
    <MotionModal
      opened={opened}
      onClose={onClose}
      title="Preferences"
      centered
      size="sm"
      transitionProps={fadeTransitionProps(motion)}
    >
      <Stack gap="md">
        <Stack gap={2}>
          <Text size="sm" fw={500}>
            Week starts on
          </Text>
          <Text size="xs" c="dimmed">
            Applies to every week and month view on your account, on all your devices.
          </Text>
        </Stack>
        {query.status === "error" ? (
          <InlineError
            message={query.error ?? "Couldn't load your preference."}
            onRetry={query.reload}
          />
        ) : value === null ? (
          <Skeleton height={34} radius="sm" />
        ) : (
          <SegmentedControl
            fullWidth
            data={[
              { label: "Monday", value: "monday" },
              { label: "Sunday", value: "sunday" },
            ]}
            value={value}
            disabled={busy}
            onChange={(next) => void handleChange(next)}
          />
        )}
      </Stack>
    </MotionModal>
  );
}
