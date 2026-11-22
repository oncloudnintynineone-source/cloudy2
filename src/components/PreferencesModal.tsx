"use client";

import { useCallback, useState } from "react";
import { SegmentedControl, Skeleton, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";

import { InlineError } from "@/components/InlineError";
import { clearAllDashboardSnapshots } from "@/lib/dashboard/localStore";
import type { WeekStart } from "@/lib/events/datetime";
import { useOpenQuery } from "@/lib/loading/useOpenQuery";
import { notifyPrefsChanged } from "@/lib/ui/prefsChanged";
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
 * week/month dashboard grid honors. Saving drops the device-local snapshots
 * and fires `PREFS_CHANGED_EVENT` — a mounted dashboard revalidates in place
 * (no document reload; docs/ui-ux-improvements.md D5) — then closes, so the
 * user watches the grids rebuild instead of losing scroll and drafts to a
 * reload. On other routes the cleared snapshots make the next dashboard visit
 * re-read with the new first day.
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
        // covered) can't paint and suppress the re-read, then tell a mounted
        // dashboard to re-read in place. The event is the whole handoff: this
        // dialog lives in the shell, outside the dashboard's data context.
        try {
          await clearAllDashboardSnapshots();
        } catch (error) {
          console.error("[prefs] Failed to clear dashboard snapshots", error);
        }
        notifyPrefsChanged();
        notifications.show({
          color: "green",
          message: `Week starts on ${next === "monday" ? "Monday" : "Sunday"}`,
        });
        onClose();
      } catch (error) {
        console.error("[prefs] Failed to save week start", error);
        notifications.show({
          color: "red",
          message: "Couldn't save your preference — check your connection and try again.",
        });
      } finally {
        setBusy(false);
      }
    },
    [setData, onClose],
  );

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
