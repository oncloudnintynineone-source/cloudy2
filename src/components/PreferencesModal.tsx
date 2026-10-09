"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Group, Loader, Modal, SegmentedControl, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";

import { clearAllDashboardSnapshots } from "@/lib/dashboard/localStore";
import type { WeekStart } from "@/lib/events/datetime";
import { getWeekStart, setWeekStart } from "@/lib/userPrefs/actions";

interface PreferencesModalProps {
  opened: boolean;
  onClose: () => void;
}

/**
 * Profile-menu dialog for account-wide preferences that follow the user across
 * devices. Currently one: which day the calendar week starts on, which every
 * week/month dashboard grid honors. Saving reloads the page so the grids and
 * their fetch sets rebuild with the new first day.
 */
export function PreferencesModal({ opened, onClose }: PreferencesModalProps) {
  const [value, setValue] = useState<WeekStart | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Render-phase reset on every open (NotificationSettings pattern): a fresh
  // open starts from a loading state, not the last fetch's result.
  const [lastOpened, setLastOpened] = useState(opened);
  if (lastOpened !== opened) {
    setLastOpened(opened);
    if (opened) {
      setValue(null);
      setLoadError(false);
    }
  }

  const load = useCallback(() => {
    getWeekStart()
      .then((current) => setValue(current))
      .catch((error) => {
        console.error("[prefs] Failed to load week start", error);
        setLoadError(true);
      });
  }, []);

  useEffect(() => {
    if (opened) {
      load();
    }
  }, [opened, load]);

  const handleChange = useCallback(async (next: string) => {
    if (next !== "monday" && next !== "sunday") return;
    setValue(next);
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
  }, []);

  return (
    <Modal opened={opened} onClose={onClose} title="Preferences" centered size="sm">
      <Stack gap="md">
        <Stack gap={2}>
          <Text size="sm" fw={500}>
            Week starts on
          </Text>
          <Text size="xs" c="dimmed">
            Applies to every week and month view on your account, on all your devices.
          </Text>
        </Stack>
        {loadError ? (
          <Group justify="space-between" align="center">
            <Text size="sm" c="red">
              Couldn&apos;t load your preference.
            </Text>
            <Button
              size="xs"
              variant="light"
              loading={busy}
              loaderProps={{ type: "oval" }}
              onClick={() => {
                setLoadError(false);
                load();
              }}
            >
              Try again
            </Button>
          </Group>
        ) : value === null ? (
          <Group justify="center" py="sm">
            <Loader size="sm" />
          </Group>
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
    </Modal>
  );
}
