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
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
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
  getWidgetViewChoices,
  listWidgetTokens,
  revokeWidgetToken,
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
 * Profile-menu dialog for home-screen widgets. A PWA cannot host a native
 * widget, so this mints read-only per-device tokens and hands the user a
 * copyable agenda URL per dashboard view (KWGT setup included inline).
 *
 * The token is shown exactly once: after it leaves this dialog only the
 * prefix remains, and recovering access means revoking and minting a new one.
 */
export function WidgetsModal({ opened, onClose }: WidgetsModalProps) {
  const [tokens, setTokens] = useState<WidgetTokenView[] | null>(null);
  const [views, setViews] = useState<WidgetViewChoice[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedToken | null>(null);

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
    }
  }

  const load = useCallback(() => {
    Promise.all([listWidgetTokens(), getWidgetViewChoices()])
      .then(([tokenList, viewList]) => {
        setTokens(tokenList);
        setViews(viewList);
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

  // Drop the plaintext token from memory as soon as the dialog closes.
  const handleClose = useCallback(() => {
    setCreated(null);
    onClose();
  }, [onClose]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const urlFor = (view: WidgetViewChoice, token: string) =>
    `${origin}/api/widget/v1/agenda?token=${encodeURIComponent(token)}&view=${encodeURIComponent(view.id)}&days=7`;

  return (
    <MotionModal opened={opened} onClose={handleClose} title="Widgets" centered size="lg">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Home-screen widgets are provided by separate apps (KWGT, Scriptable, Widgy) — a PWA
          can&apos;t add one itself. Cloudy2 exposes a read-only agenda for any of your dashboard
          views; the widget only updates when you tap its refresh button.
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
            <Text size="sm" fw={600}>
              Your devices
            </Text>
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
          </Stack>
        )}

        <Divider />

        <Stack gap="xs">
          <Text size="sm" fw={600}>
            Add a device
          </Text>
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
              disabled={tokens === null}
              onClick={() => void handleCreate()}
            >
              Create token
            </Button>
          </Group>
          <Text size="xs" c="dimmed">
            The token is read-only, never expires and can be revoked here at any time.
          </Text>
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
