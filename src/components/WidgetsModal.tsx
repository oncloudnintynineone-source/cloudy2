"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Code,
  CopyButton,
  Divider,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconBrandAndroid,
  IconBrandApple,
  IconCalendar,
  IconCheck,
  IconCopy,
  IconDeviceMobile,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react";
import dayjs from "dayjs";

import { MotionModal } from "@/components/MotionModal";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import {
  createWidgetToken,
  getWidgetFeedLinks,
  getWidgetViewChoices,
  listWidgetTokens,
  revokeWidgetToken,
  rotateWidgetFeedLink,
  type WidgetFeedLink,
  type WidgetTokenView,
  type WidgetViewChoice,
} from "@/lib/widgets/actions";

interface WidgetsModalProps {
  opened: boolean;
  onClose: () => void;
}

interface CreatedToken {
  id: string;
  token: string;
  label: string;
  prefix: string;
}

/** `1 Aug, 14:05` — dates here are only ever rendered client-side. */
function formatStamp(iso: string): string {
  return dayjs(iso).format("D MMM, HH:mm");
}

function CopyIconButton({ value, label }: { value: string; label: string }) {
  return (
    <CopyButton value={value}>
      {({ copied, copy }) => (
        <Tooltip label={copied ? "Copied" : label} withArrow>
          <ActionIcon
            variant="light"
            size="sm"
            aria-label={copied ? "Copied" : label}
            onClick={copy}
          >
            {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
          </ActionIcon>
        </Tooltip>
      )}
    </CopyButton>
  );
}

/**
 * Profile-menu dialog for home-screen widgets and calendar subscriptions.
 *
 * The primary surface is the **signed calendar-feed URL**: a PWA cannot host a
 * native widget, but Apple Calendar (and third-party calendar apps) can
 * subscribe to an ICS feed, and the native calendar widget renders it. The URL
 * is derived from a per-user version counter, so it can be shown again and
 * rotated here. Android deliberately uses the already-shared Google Calendar
 * instead, because Google refreshes external ICS feeds only every ~12–24h.
 *
 * The secondary surface is the per-device widget token for KWGT/HTTP clients
 * that want the JSON agenda with a manual refresh; its plaintext is shown once.
 */
export function WidgetsModal({ opened, onClose }: WidgetsModalProps) {
  const [tokens, setTokens] = useState<WidgetTokenView[] | null>(null);
  const [views, setViews] = useState<WidgetViewChoice[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedToken | null>(null);

  const [feedLinks, setFeedLinks] = useState<WidgetFeedLink[] | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [feedViewId, setFeedViewId] = useState("");
  const [rotating, setRotating] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);

  // Render-phase reset on every open (PreferencesModal pattern).
  const [lastOpened, setLastOpened] = useState(opened);
  if (lastOpened !== opened) {
    setLastOpened(opened);
    if (opened) {
      setTokens(null);
      setViews([]);
      setLoadError(false);
      setLabel("");
      setCreated(null);
      setFeedLinks(null);
      setFeedError(null);
      setFeedViewId("");
      setConfirmRotate(false);
    }
  }

  const load = useCallback(() => {
    Promise.all([listWidgetTokens(), getWidgetViewChoices(), getWidgetFeedLinks()])
      .then(([tokenList, viewList, feed]) => {
        setTokens(tokenList);
        setViews(viewList);
        if (feed.ok) {
          setFeedLinks(feed.links);
          setFeedViewId(feed.links[0]?.viewId ?? "");
          setFeedError(null);
        } else {
          setFeedLinks([]);
          setFeedError(feed.error);
        }
      })
      .catch((error) => {
        console.error("[widgets] Failed to load widget settings", error);
        setLoadError(true);
      });
  }, []);

  useEffect(() => {
    if (opened) {
      load();
    }
  }, [opened, load]);

  const handleCreate = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    try {
      const result = await createWidgetToken({ label });
      if (!result.ok) {
        notifications.show({ color: "red", message: result.error });
        return;
      }
      setCreated({
        id: result.id,
        token: result.token,
        label: result.label,
        prefix: result.prefix,
      });
      setLabel("");
      setTokens((current) =>
        current
          ? [
              {
                id: result.id,
                label: result.label,
                prefix: result.prefix,
                lastUsedAt: null,
                createdAt: result.createdAt,
              },
              ...current,
            ]
          : current,
      );
    } catch (error) {
      console.error("[widgets] Failed to create widget token", error);
      notifications.show({
        color: "red",
        message: "Couldn't create the token — check your connection and try again.",
      });
    } finally {
      setCreating(false);
    }
  }, [creating, label]);

  const handleRevoke = useCallback(
    async (token: WidgetTokenView) => {
      if (revokingId) return;
      setRevokingId(token.id);
      try {
        const result = await revokeWidgetToken(token.id);
        if (!result.ok) {
          notifications.show({ color: "red", message: result.error });
          return;
        }
        setTokens((current) => current?.filter((row) => row.id !== token.id) ?? current);
        setCreated((current) => (current?.id === token.id ? null : current));
        notifications.show({ color: "green", message: `Revoked "${token.label}"` });
      } catch (error) {
        console.error("[widgets] Failed to revoke widget token", error);
        notifications.show({
          color: "red",
          message: "Couldn't revoke the token — check your connection and try again.",
        });
      } finally {
        setRevokingId(null);
      }
    },
    [revokingId],
  );

  const handleRotate = useCallback(async () => {
    if (rotating) return;
    if (!confirmRotate) {
      setConfirmRotate(true);
      return;
    }
    setRotating(true);
    try {
      const result = await rotateWidgetFeedLink();
      if (!result.ok) {
        notifications.show({ color: "red", message: result.error });
        return;
      }
      setFeedLinks(result.links);
      setFeedViewId(result.links[0]?.viewId ?? "");
      setConfirmRotate(false);
      notifications.show({
        color: "green",
        message: "Feed link rotated — re-subscribe with the new URL.",
      });
    } catch (error) {
      console.error("[widgets] Failed to rotate the feed link", error);
      notifications.show({
        color: "red",
        message: "Couldn't rotate the feed link — check your connection and try again.",
      });
    } finally {
      setRotating(false);
    }
  }, [rotating, confirmRotate]);

  // Drop the plaintext token from memory as soon as the dialog closes.
  const handleClose = useCallback(() => {
    setCreated(null);
    onClose();
  }, [onClose]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const urlFor = (view: WidgetViewChoice, token: string) =>
    `${origin}/api/widget/v1/agenda?token=${encodeURIComponent(token)}&view=${encodeURIComponent(view.id)}&days=7`;

  const selectedFeed =
    feedLinks?.find((link) => link.viewId === feedViewId) ?? feedLinks?.[0] ?? null;

  return (
    <MotionModal opened={opened} onClose={handleClose} title="Calendar & widgets" centered size="lg">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          A PWA can&apos;t host a native widget. On iPhone/iPad, subscribe to the read-only calendar
          feed below and use the native Calendar widget. On Android, use the department calendar
          you already have in Google Calendar.
        </Text>

        {/* Calendar feed (primary) */}
        <Stack gap="xs">
          <Group justify="space-between" align="center" wrap="nowrap">
            <Group gap="xs">
              <IconBrandApple size={16} aria-hidden />
              <Text size="sm" fw={600}>
                Calendar feed
              </Text>
            </Group>
            <Badge variant="light">iPhone / iPad</Badge>
          </Group>

          {feedError ? (
            <Group justify="space-between" align="center">
              <Text size="sm" c="red">
                {feedError}
              </Text>
              <Button
                size="xs"
                variant="light"
                loaderProps={BUTTON_LOADER_PROPS}
                onClick={() => {
                  setFeedLinks(null);
                  setFeedError(null);
                  load();
                }}
              >
                Try again
              </Button>
            </Group>
          ) : feedLinks === null ? (
            <Group justify="center" py="sm">
              <Loader size="sm" />
            </Group>
          ) : feedLinks.length === 0 ? (
            <Text size="sm" c="dimmed">
              No dashboard views available.
            </Text>
          ) : (
            <>
              <Select
                label="View"
                allowDeselect={false}
                data={feedLinks.map((link) => ({
                  value: link.viewId,
                  label: `${link.viewName} (${link.kind})`,
                }))}
                value={feedViewId}
                onChange={(value) => setFeedViewId(value ?? "")}
              />
              {selectedFeed && (
                <>
                  <Code
                    block
                    style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}
                  >
                    {selectedFeed.icsUrl}
                  </Code>
                  <Group gap="xs">
                    <CopyIconButton value={selectedFeed.icsUrl} label="Copy feed URL" />
                    <Button
                      component="a"
                      href={selectedFeed.webcalUrl}
                      size="xs"
                      variant="light"
                      leftSection={<IconCalendar size={14} />}
                    >
                      Open in Calendar
                    </Button>
                    {confirmRotate ? (
                      <>
                        <Button
                          size="xs"
                          color="red"
                          loaderProps={BUTTON_LOADER_PROPS}
                          loading={rotating}
                          onClick={() => void handleRotate()}
                        >
                          Confirm rotate
                        </Button>
                        <Button
                          size="xs"
                          variant="subtle"
                          onClick={() => setConfirmRotate(false)}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="xs"
                        variant="subtle"
                        color="red"
                        leftSection={<IconRefresh size={14} />}
                        onClick={() => setConfirmRotate(true)}
                      >
                        Rotate feed link
                      </Button>
                    )}
                  </Group>
                  <Text size="xs" c="dimmed">
                    Rotating breaks every existing subscription; you&apos;ll need to re-subscribe
                    with the new URL.
                  </Text>
                </>
              )}
              <Text size="xs" c="dimmed">
                iPhone/iPad: Settings → Calendar → Accounts → Add Account → Other → Add
                Subscribed Calendar → paste the URL. Set the refresh interval, then add the
                Calendar widget and select “Cloudy2 · {selectedFeed?.viewName ?? "view"}”. Mac:
                Calendar → File → New Calendar Subscription.
              </Text>
              <Text size="xs" c="dimmed">
                Apple Calendar refreshes subscriptions roughly hourly (configurable). If a
                department calendar is also enabled, hide it to avoid duplicate copies.
              </Text>
            </>
          )}
        </Stack>

        <Divider />

        {/* Android direct calendar */}
        <Group gap="xs" wrap="nowrap" align="flex-start">
          <IconBrandAndroid size={16} aria-hidden style={{ marginTop: 2 }} />
          <Stack gap={4}>
            <Text size="sm" fw={600}>
              Android
            </Text>
            <Text size="xs" c="dimmed">
              Don&apos;t subscribe to the ICS feed here — Google Calendar refreshes external
              calendars only every 12–24 hours. Your department calendar is already shared with
              your Google account: enable it in Google Calendar, add the Google Calendar widget,
              and select it. If you have several department calendars, hide the extras so events
              don&apos;t appear twice.
            </Text>
          </Stack>
        </Group>

        <Divider />

        {/* HTTP widgets (advanced) */}
        <Stack gap="xs">
          <Group justify="space-between" align="center" wrap="nowrap">
            <Group gap="xs">
              <IconDeviceMobile size={16} aria-hidden />
              <Text size="sm" fw={600}>
                HTTP widgets (advanced)
              </Text>
            </Group>
            <Badge variant="light" color="gray">
              KWGT / Scriptable / Widgy
            </Badge>
          </Group>
          <Text size="xs" c="dimmed">
            A read-only JSON agenda per view, for custom widgets that support a URL and a manual
            refresh. The token is shown once; revoke it here at any time.
          </Text>

          {loadError ? (
            <Group justify="space-between" align="center">
              <Text size="sm" c="red">
                Couldn&apos;t load your widget tokens.
              </Text>
              <Button
                size="xs"
                variant="light"
                loaderProps={BUTTON_LOADER_PROPS}
                onClick={() => {
                  setTokens(null);
                  setLoadError(false);
                  load();
                }}
              >
                Try again
              </Button>
            </Group>
          ) : tokens === null ? (
            <Group justify="center" py="sm">
              <Loader size="sm" />
            </Group>
          ) : (
            <Stack gap="xs">
              {tokens.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No widget tokens yet.
                </Text>
              ) : (
                tokens.map((token) => (
                  <Group key={token.id} justify="space-between" wrap="nowrap" gap="sm">
                    <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                      <IconDeviceMobile size={16} aria-hidden />
                      <Stack gap={0} style={{ minWidth: 0 }}>
                        <Text size="sm" fw={500} truncate>
                          {token.label}
                        </Text>
                        <Text size="xs" c="dimmed" truncate>
                          {token.prefix}… ·{" "}
                          {token.lastUsedAt
                            ? `last used ${formatStamp(token.lastUsedAt)}`
                            : "never used"}
                        </Text>
                      </Stack>
                    </Group>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label={`Revoke ${token.label}`}
                      loading={revokingId === token.id}
                      disabled={revokingId !== null}
                      onClick={() => void handleRevoke(token)}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                ))
              )}

              <Group align="flex-end" wrap="nowrap">
                <TextInput
                  label="Label"
                  description="Name it after the device or widget"
                  placeholder="Pixel 9 KWGT"
                  maxLength={40}
                  value={label}
                  onChange={(event) => setLabel(event.currentTarget.value)}
                  style={{ flex: 1 }}
                />
                <Button
                  loaderProps={BUTTON_LOADER_PROPS}
                  loading={creating}
                  onClick={() => void handleCreate()}
                >
                  Create token
                </Button>
              </Group>
            </Stack>
          )}
        </Stack>

        {created && (
          <Card withBorder radius="md" padding="md">
            <Stack gap="sm">
              <Group justify="space-between" align="center" wrap="nowrap">
                <Text size="sm" fw={600}>
                  {created.label}
                </Text>
                <Badge color="yellow" variant="light">
                  Shown once
                </Badge>
              </Group>
              <Group gap="xs" wrap="nowrap">
                <Code style={{ flex: 1, overflowWrap: "anywhere" }}>{created.token}</Code>
                <CopyIconButton value={created.token} label="Copy token" />
              </Group>
              <Text size="xs" c="dimmed">
                Copy this now — it won&apos;t be shown again. If it leaks, revoke it and create a
                new one.
              </Text>

              <Divider />

              <Text size="sm" fw={500}>
                Agenda URLs
              </Text>
              <Text size="xs" c="dimmed">
                One per dashboard view. The widget renders that view&apos;s filters and title
                recipe as a forward agenda.
              </Text>
              <Stack gap={6}>
                {views.map((view) => (
                  <Group key={view.id} justify="space-between" gap="xs" wrap="nowrap">
                    <Text size="sm" truncate>
                      {view.name}{" "}
                      <Text span size="xs" c="dimmed">
                        ({view.kind})
                      </Text>
                    </Text>
                    <CopyIconButton
                      value={urlFor(view, created.token)}
                      label={`Copy URL for ${view.name}`}
                    />
                  </Group>
                ))}
              </Stack>

              <Divider />

              <Group gap="xs" wrap="nowrap" align="flex-start">
                <IconRefresh size={16} aria-hidden style={{ marginTop: 2 }} />
                <Stack gap={6}>
                  <Text size="sm" fw={500}>
                    KWGT (manual refresh)
                  </Text>
                  <Text size="xs" c="dimmed">
                    1. Add a text global named <Code>c2json</Code>.
                  </Text>
                  <Text size="xs" c="dimmed">
                    2. Store the token as a Kustom secret global (e.g. <Code>c2token</Code>).
                  </Text>
                  <Text size="xs" c="dimmed">
                    3. Create a Flow: manual trigger → WebGet (the URL above, with{" "}
                    <Code>$gv(c2token)$</Code> as the token) → store to <Code>c2json</Code>.
                  </Text>
                  <Text size="xs" c="dimmed">
                    4. Give your refresh button a touch action that runs the Flow.
                  </Text>
                  <Text size="xs" c="dimmed">
                    5. Render fields with{" "}
                    <Code>$wg(gv(c2json), json, .flat.nextTitle)$</Code> — also{" "}
                    <Code>.flat.nextWhen</Code>, <Code>.flat.updatedLabel</Code>,{" "}
                    <Code>.flat.e1Title</Code>, <Code>.flat.pinnedNextTitle</Code>.
                  </Text>
                  <Text size="xs" c="dimmed">
                    Tap the refresh button once to populate the widget. After that it only
                    updates on tap.
                  </Text>
                </Stack>
              </Group>

              {views.length > 0 && (
                <Group justify="flex-end">
                  <CopyIconButton
                    value={urlFor(views[0], created.token)}
                    label="Copy the first agenda URL"
                  />
                </Group>
              )}
            </Stack>
          </Card>
        )}
      </Stack>
    </MotionModal>
  );
}
