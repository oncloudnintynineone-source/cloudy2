"use client";

import { useCallback, useState } from "react";
import {
  Button,
  Group,
  Skeleton,
  Stack,
  Switch,
  Text,
  useMantineTheme,
} from "@mantine/core";
import { MotionModal } from "@/components/MotionModal";

import { useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";

import { InlineError } from "@/components/InlineError";
import { LoadingStatus } from "@/components/LoadingStatus";
import { useOpenQuery } from "@/lib/loading/useOpenQuery";

import {
  getParticipantPushSettings,
  setEventInvitePush,
  syncPushSubscription,
  sendTestPush,
  unsyncPushSubscription,
  type ParticipantPushSettings,
} from "@/lib/events/participantNotify/actions";
import {
  currentPushSubscription,
  pushPermissionState,
  pushSupported,
  pushSwState,
  subscriptionPayload,
  type PushSwState,
  requestPushPermission,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/events/participantNotify/client";
import { NARROW_MEDIA_QUERY } from "@/lib/theme";

interface NotificationSettingsProps {
  opened: boolean;
  onClose: () => void;
}

const mapNotificationSettingsError = () =>
  "Couldn't load your notification settings. Check your connection and try again.";

interface BrowserState {
  supported: boolean;
  permission: NotificationPermission | null;
  /** Service-worker reachability on this device ("unsupported" when !supported). */
  sw: PushSwState;
  subscribed: boolean;
  endpoint: string | null;
  /** A server-side error from the silent re-own of the device row, if any. */
  syncError: string | null;
}

type BusyAction = "enable" | "turnoff" | "test" | null;

/** Snapshot the browser-side push state. Never throws, never hangs. */
async function readBrowserState(): Promise<BrowserState> {
  const supported = pushSupported();
  const permission = pushPermissionState();
  const base: BrowserState = {
    supported,
    permission,
    sw: "unsupported",
    subscribed: false,
    endpoint: null,
    syncError: null,
  };
  if (!supported) {
    return base;
  }
  const sw = await pushSwState();
  if (sw !== "ok") {
    return { ...base, sw };
  }
  if (permission !== "granted") {
    return { ...base, sw };
  }
  const subscription = await currentPushSubscription();
  if (!subscription) {
    return { ...base, sw };
  }
  const payload = subscriptionPayload(subscription);
  if (!payload) {
    return { ...base, sw, subscribed: true, endpoint: subscription.endpoint };
  }
  // Re-own the device's endpoint row for the signed-in account whenever this
  // dialog opens — covers a shared device where a different account is now
  // logged in (the browser subscription is already granted). No-op when the
  // row already belongs to this account (upsert-by-endpoint).
  let syncError: string | null = null;
  try {
    const result = await syncPushSubscription(payload);
    if (!result.ok) {
      syncError = result.error;
    }
  } catch {
    syncError = "Couldn't save this device — tap Enable notifications to retry.";
  }
  return { ...base, sw, subscribed: true, endpoint: subscription.endpoint, syncError };
}

/** Fetch the server settings + browser push state together. */
async function fetchSettingsAndBrowser(): Promise<{
  settings: ParticipantPushSettings;
  browser: BrowserState;
}> {
  const [settings, browser] = await Promise.all([
    getParticipantPushSettings(),
    readBrowserState(),
  ]);
  return { settings, browser };
}

/**
 * Profile-menu dialog for event participant Web Push notifications: enable /
 * disable on this device (the browser permission + subscription), a "Send test"
 * that exercises the real send path, and the per-profile master switch that
 * pauses them app-wide. Every branch reaches a terminal state — a service
 * worker that never activates surfaces guidance instead of an eternal spinner.
 */
export function NotificationSettings({ opened, onClose }: NotificationSettingsProps) {
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const isNarrow = useMediaQuery(NARROW_MEDIA_QUERY);
  const query = useOpenQuery<{
    settings: ParticipantPushSettings;
    browser: BrowserState;
  }>({
    enabled: opened,
    load: fetchSettingsAndBrowser,
    mapError: mapNotificationSettingsError,
  });
  const settings = query.data?.settings ?? null;
  const browser = query.data?.browser ?? null;
  const { reload: reloadQuery, data: queryData, setData } = query;
  const [busy, setBusy] = useState<BusyAction>(null);

  const reload = useCallback(async (): Promise<void> => {
    reloadQuery();
  }, [reloadQuery]);

  const handleEnable = useCallback(async () => {
    if (busy) {
      return;
    }
    setBusy("enable");
    try {
      let permission = pushPermissionState();
      if (permission === "default") {
        permission = await requestPushPermission();
      }
      if (permission === "denied") {
        notifications.show({
          color: "red",
          message: "Notifications are blocked — allow them in your browser settings, then retry.",
        });
      } else if (permission === "granted") {
        const subscription = await subscribeToPush();
        if (!subscription) {
          notifications.show({
            color: "red",
            message:
              "Couldn't set up notifications on this device — the background service isn't ready. Reopen the installed app and try again.",
          });
        } else {
          const payload = subscriptionPayload(subscription);
          if (payload) {
            const result = await syncPushSubscription(payload);
            if (!result.ok) {
              notifications.show({ color: "red", message: result.error });
            }
          }
        }
      }
      await reload();
    } catch (error) {
      console.error("[push] Enable failed", error);
      notifications.show({
        color: "red",
        message: "Couldn't enable notifications — please try again.",
      });
    } finally {
      setBusy(null);
    }
  }, [busy, reload]);

  const handleTurnOffDevice = useCallback(async () => {
    if (busy) {
      return;
    }
    const endpoint = browser?.endpoint ?? null;
    setBusy("turnoff");
    try {
      await unsubscribeFromPush();
      if (endpoint) {
        const result = await unsyncPushSubscription(endpoint);
        if (!result.ok) {
          notifications.show({ color: "red", message: result.error });
        }
      }
      await reload();
    } catch (error) {
      console.error("[push] Turn off failed", error);
      notifications.show({ color: "red", message: "Couldn't turn notifications off — try again." });
    } finally {
      setBusy(null);
    }
  }, [browser, busy, reload]);

  const handleSendTest = useCallback(async () => {
    if (busy) {
      return;
    }
    const endpoint = browser?.endpoint ?? null;
    if (!endpoint) {
      return;
    }
    setBusy("test");
    try {
      const result = await sendTestPush(endpoint);
      if (result.ok) {
        notifications.show({ color: "green", message: "Test notification sent — check your device." });
      } else {
        notifications.show({ color: "red", message: result.error });
      }
    } catch (error) {
      console.error("[push] Send test failed", error);
      notifications.show({ color: "red", message: "Couldn't send the test notification — try again." });
    } finally {
      setBusy(null);
    }
  }, [browser, busy]);

  const handleMasterToggle = useCallback(
    async (enabled: boolean) => {
      if (queryData && queryData.settings.ok) {
        setData({
          ...queryData,
          settings: { ...queryData.settings, eventInvitePush: enabled },
        });
      }
      const result = await setEventInvitePush(enabled);
      if (!result.ok) {
        notifications.show({ color: "red", message: result.error });
      }
    },
    [queryData, setData],
  );

  const okSettings = settings?.ok ? settings : null;
  const readyForDevice =
    browser !== null &&
    browser.supported &&
    browser.sw === "ok" &&
    okSettings?.serverPushEnabled === true;
  const deviceActive =
    readyForDevice && browser?.permission === "granted" && browser?.subscribed === true;
  const showEnable =
    readyForDevice &&
    browser?.permission !== "denied" &&
    (browser?.permission === "default" ||
      (browser?.permission === "granted" && browser?.subscribed === false));

  return (
    <MotionModal
      opened={opened}
      onClose={onClose}
      title="Notifications"
      centered
      size={isNarrow ? "xs" : isDesktop ? "md" : "sm"}
    >
      {query.status === "error" || (settings !== null && !settings.ok) ? (
        <InlineError
          message={
            settings && !settings.ok
              ? (settings.error ?? "Couldn't load your notification settings.")
              : (query.error ?? "Couldn't load your notification settings.")
          }
          onRetry={query.reload}
        />
      ) : !settings || !browser ? (
        <Stack gap="sm" py="md">
          <LoadingStatus label="Loading notification settings" />
          <Skeleton height={20} radius="sm" width="70%" />
          <Skeleton height={20} radius="sm" width="90%" />
          <Skeleton height={36} radius="sm" />
        </Stack>
      ) : (
        <Stack gap="lg">
          <Stack gap={2}>
            <Text size="sm">
              Get notified when you&apos;re added as a participant to an event.
            </Text>
            <Text size="sm" c="dimmed">
              Tags apply the moment an event is created or edited; you won&apos;t be
              notified when your own change adds you.
            </Text>
          </Stack>

          {!settings.canSubscribe ? (
            <Text size="sm" c="dimmed">
              This is the global Admin account, not a roster profile, so notifications can&apos;t be
              sent to it. Log in with your own account to set these up.
            </Text>
          ) : !settings.serverPushEnabled ? (
            <Stack gap={2}>
              <Text size="sm" c="orange">
                Event notifications aren&apos;t turned on for this server yet.
              </Text>
              <Text size="xs" c="dimmed">
                An admin needs to set the VAPID environment variables before any notification can be
                sent.
              </Text>
            </Stack>
          ) : !browser.supported ? (
            <Stack gap={2}>
              <Text size="sm" c="orange">
                Notifications aren&apos;t supported in this browser.
              </Text>
              <Text size="xs" c="dimmed">
                On iPhone/iPad, add Cloudy2 to your Home Screen (Share → Add to Home Screen) and open
                it from there — notifications only work in the installed app, not the browser tab.
                On Android, install the app from Chrome.
              </Text>
            </Stack>
          ) : browser.sw !== "ok" ? (
            <Stack gap={2}>
              <Text size="sm" c="orange">
                Cloudy2&apos;s background service isn&apos;t running on this device.
              </Text>
              <Text size="xs" c="dimmed">
                Close the installed app completely and reopen it, then open this screen again. If it
                still can&apos;t connect, reinstall the app.
              </Text>
              <Button size="xs" variant="light" onClick={() => window.location.reload()}>
                Reload app
              </Button>
            </Stack>
          ) : browser.permission === "denied" ? (
            <Stack gap={2}>
              <Text size="sm" c="orange">
                Notifications are blocked for this app.
              </Text>
              <Text size="xs" c="dimmed">
                Allow notifications in your browser or phone settings, then reopen this screen.
              </Text>
            </Stack>
          ) : (
            <Stack gap={2}>
              {deviceActive ? (
                <>
                  <Text size="sm" c="green">
                    Notifications are on for this device.
                  </Text>
                  {browser.syncError && (
                    <Text size="xs" c="orange">
                      {browser.syncError}
                    </Text>
                  )}
                  <Group gap="xs" wrap="wrap">
                    <Button
                      size="xs"
                      variant="light"
                      loading={busy === "test"}
                      loaderProps={{ type: "oval" }}
                      onClick={() => void handleSendTest()}
                    >
                      Send test notification
                    </Button>
                    <Button
                      size="xs"
                      variant="subtle"
                      color="red"
                      px={0}
                      loading={busy === "turnoff"}
                      loaderProps={{ type: "oval" }}
                      onClick={() => void handleTurnOffDevice()}
                    >
                      Turn off on this device
                    </Button>
                  </Group>
                </>
              ) : showEnable ? (
                <>
                  <Text size="sm" c="dimmed">
                    {browser.permission === "granted"
                      ? "This device isn&apos;t subscribed yet."
                      : "Allow notifications to receive event invites here."}
                  </Text>
                  <Button
                    size="xs"
                    loading={busy === "enable"}
                    loaderProps={{ type: "oval" }}
                    onClick={() => void handleEnable()}
                  >
                    Enable notifications
                  </Button>
                </>
              ) : null}
            </Stack>
          )}

          {settings.canSubscribe && (
            <Stack gap={4}>
              <Switch
                label="Receive event-invite notifications"
                description="Pauses these notifications on every device signed in as you (the browser permission stays on)."
                checked={settings.ok ? settings.eventInvitePush : true}
                onChange={(event) => void handleMasterToggle(event.currentTarget.checked)}
              />
            </Stack>
          )}
        </Stack>
      )}
    </MotionModal>
  );
}
