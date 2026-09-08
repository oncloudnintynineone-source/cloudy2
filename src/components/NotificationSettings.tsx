"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Switch,
  Text,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";

import {
  getParticipantPushSettings,
  setEventInvitePush,
  syncPushSubscription,
  unsyncPushSubscription,
  type ParticipantPushSettings,
  type ClientPushSubscription,
} from "@/lib/events/participantNotify/actions";
import {
  currentPushSubscription,
  pushPermissionState,
  pushSupported,
  requestPushPermission,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/events/participantNotify/client";
import { NARROW_MEDIA_QUERY } from "@/lib/theme";

interface NotificationSettingsProps {
  opened: boolean;
  onClose: () => void;
}

interface BrowserState {
  supported: boolean;
  permission: NotificationPermission | null;
  subscribed: boolean;
  endpoint: string | null;
}

/** Snapshot the browser-side push state (never throws). */
async function readBrowserState(): Promise<BrowserState> {
  const supported = pushSupported();
  const permission = pushPermissionState();
  let subscribed = false;
  let endpoint: string | null = null;
  if (supported && permission === "granted") {
    const subscription = await currentPushSubscription().catch(() => null);
    subscribed = subscription !== null;
    endpoint = subscription?.endpoint ?? null;
    if (subscription) {
      // Re-own the device's endpoint row for the signed-in account whenever
      // this dialog opens — covers a shared device where a different account
      // is now logged in (the browser subscription is already granted). No-op
      // when the row already belongs to this account (upsert-by-endpoint).
      const payload = subscriptionPayload(subscription);
      if (payload) {
        void syncPushSubscription(payload).catch(() => undefined);
      }
    }
  }
  return { supported, permission, subscribed, endpoint };
}

/** Pull the subscription's { endpoint, keys } for the server action. */
function subscriptionPayload(subscription: PushSubscription): ClientPushSubscription | null {
  const p256dh = subscription.getKey("p256dh");
  const auth = subscription.getKey("auth");
  if (!p256dh || !auth) {
    return null;
  }
  const toBase64Url = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  return {
    endpoint: subscription.endpoint,
    keys: { p256dh: toBase64Url(p256dh), auth: toBase64Url(auth) },
  };
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
 * disable on this device (the browser permission + subscription) and the
 * per-profile master switch that pauses them app-wide. The device half only
 * exists on browsers that support Web Push (the installed PWA on Android and
 * iOS 16.4+); the master switch is account-wide.
 */
export function NotificationSettings({ opened, onClose }: NotificationSettingsProps) {
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const isNarrow = useMediaQuery(NARROW_MEDIA_QUERY);
  const [settings, setSettings] = useState<ParticipantPushSettings | null>(null);
  const [browser, setBrowser] = useState<BrowserState | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Render-phase reset on every open (CalendarAccessModal pattern): a fresh
  // open starts from a loading state, not the last fetch's result.
  const [lastOpened, setLastOpened] = useState(opened);
  if (lastOpened !== opened) {
    setLastOpened(opened);
    if (opened) {
      setSettings(null);
      setBrowser(null);
      setLoadError(false);
    }
  }

  const reload = useCallback(async () => {
    try {
      const { settings: nextSettings, browser: nextBrowser } = await fetchSettingsAndBrowser();
      setSettings(nextSettings);
      setBrowser(nextBrowser);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    if (opened) {
      fetchSettingsAndBrowser()
        .then(({ settings: nextSettings, browser: nextBrowser }) => {
          setSettings(nextSettings);
          setBrowser(nextBrowser);
          setLoadError(false);
        })
        .catch(() => {
          setLoadError(true);
        });
    }
  }, [opened]);

  const handleEnable = useCallback(async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      let permission = pushPermissionState();
      if (permission === "default") {
        permission = await requestPushPermission();
      }
      if (permission === "granted") {
        const subscription = await subscribeToPush();
        if (subscription) {
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
    } finally {
      setBusy(false);
    }
  }, [busy, reload]);

  const handleTurnOffDevice = useCallback(async () => {
    if (busy) {
      return;
    }
    const endpoint = browser?.endpoint ?? null;
    setBusy(true);
    try {
      await unsubscribeFromPush();
      if (endpoint) {
        await unsyncPushSubscription(endpoint);
      }
      await reload();
    } finally {
      setBusy(false);
    }
  }, [browser, busy, reload]);

  const handleMasterToggle = useCallback(async (enabled: boolean) => {
    setSettings((current) =>
      current && current.ok ? { ...current, eventInvitePush: enabled } : current,
    );
    const result = await setEventInvitePush(enabled);
    if (!result.ok) {
      notifications.show({ color: "red", message: result.error });
    }
  }, []);

  const canUseDevicePush =
    browser !== null && browser.supported && browser.permission === "granted";
  const showEnable =
    browser !== null &&
    browser.supported &&
    (browser.permission === "default" ||
      (browser.permission === "granted" && !browser.subscribed));

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Notifications"
      centered
      size={isNarrow ? "xs" : isDesktop ? "md" : "sm"}
    >
      {loadError ? (
        <Stack gap="sm" align="flex-start">
          <Text size="sm" c="red">
            Couldn&apos;t load your notification settings.
          </Text>
          <Button size="xs" variant="light" onClick={() => void reload()}>
            Try again
          </Button>
        </Stack>
      ) : !settings || !browser ? (
        <Group justify="center" py="lg">
          <Loader size="sm" />
        </Group>
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
          ) : browser.permission === "denied" ? (
            <Stack gap={2}>
              <Text size="sm" c="orange">
                Notifications are blocked for this app.
              </Text>
              <Text size="xs" c="dimmed">
                Allow notifications in your browser or phone settings (Safari: app name → Notifications
                → Allow), then reopen this screen.
              </Text>
            </Stack>
          ) : (
            <Stack gap={2}>
              {canUseDevicePush && browser.subscribed ? (
                <>
                  <Text size="sm" c="green">
                    Notifications are on for this device.
                  </Text>
                  <Button
                    variant="subtle"
                    color="red"
                    size="xs"
                    px={0}
                    loading={busy}
                    loaderProps={{ type: "oval" }}
                    onClick={() => void handleTurnOffDevice()}
                  >
                    Turn off on this device
                  </Button>
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
                    loading={busy}
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
                checked={settings.eventInvitePush}
                onChange={(event) => void handleMasterToggle(event.currentTarget.checked)}
              />
            </Stack>
          )}
        </Stack>
      )}
    </Modal>
  );
}
