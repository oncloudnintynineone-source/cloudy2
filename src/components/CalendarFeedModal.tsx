"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Code,
  CopyButton,
  Divider,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconBrandAndroid,
  IconBrandApple,
  IconCalendar,
  IconCheck,
  IconCopy,
  IconRefresh,
} from "@tabler/icons-react";

import { MotionModal } from "@/components/MotionModal";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import {
  getWidgetFeedLinks,
  rotateWidgetFeedLink,
  type WidgetFeedLink,
} from "@/lib/widgets/actions";

interface CalendarFeedModalProps {
  opened: boolean;
  onClose: () => void;
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
 * Which view the dialog should start on: the current selection when it still
 * exists, else the calendar page's active `?view=` tab, else the first view.
 * Reading `?view=` here (rather than a hook) keeps the shell free of a
 * `useSearchParams` Suspense requirement; a legacy kind value or a deleted view
 * simply falls through.
 */
export function preferredFeedViewId(links: readonly WidgetFeedLink[], current: string): string {
  if (current && links.some((link) => link.viewId === current)) {
    return current;
  }
  if (typeof window !== "undefined") {
    const fromUrl = new URLSearchParams(window.location.search).get("view");
    if (fromUrl && links.some((link) => link.viewId === fromUrl)) {
      return fromUrl;
    }
  }
  return links[0]?.viewId ?? "";
}

/**
 * Profile-menu dialog for the signed ICS calendar feed (docs/calendar-feed.md).
 *
 * The feed is the only native-widget path: it is a read-only subscription the
 * phone's calendar app stores, so the URL is derived from a per-user version
 * counter and can be shown again / rotated here. One URL per dashboard view;
 * the dialog opens on the view currently active on the calendar page, and the
 * feed content is that view's filters + title recipe.
 */
export function CalendarFeedModal({ opened, onClose }: CalendarFeedModalProps) {
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
      setFeedLinks(null);
      setFeedError(null);
      setFeedViewId("");
      setConfirmRotate(false);
    }
  }

  const load = useCallback(() => {
    getWidgetFeedLinks()
      .then((feed) => {
        if (!feed.ok) {
          setFeedLinks([]);
          setFeedError(feed.error);
          return;
        }
        setFeedLinks(feed.links);
        setFeedError(null);
        setFeedViewId((current) => preferredFeedViewId(feed.links, current));
      })
      .catch((error) => {
        console.error("[calendar-feed] Failed to load the feed links", error);
        setFeedLinks([]);
        setFeedError("Couldn't load your calendar feed — check your connection and try again.");
      });
  }, []);

  useEffect(() => {
    if (opened) {
      load();
    }
  }, [opened, load]);

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
      setFeedViewId((current) => preferredFeedViewId(result.links, current));
      setConfirmRotate(false);
      notifications.show({
        color: "green",
        message: "Feed link rotated — re-subscribe with the new URL.",
      });
    } catch (error) {
      console.error("[calendar-feed] Failed to rotate the feed link", error);
      notifications.show({
        color: "red",
        message: "Couldn't rotate the feed link — check your connection and try again.",
      });
    } finally {
      setRotating(false);
    }
  }, [rotating, confirmRotate]);

  const selectedFeed =
    feedLinks?.find((link) => link.viewId === feedViewId) ?? feedLinks?.[0] ?? null;

  return (
    <MotionModal opened={opened} onClose={onClose} title="Calendar feed" centered size="lg">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Subscribe once to a read-only feed of one of your calendar views. The native calendar
          widget on iPhone, iPad or Android then shows it — no app or token setup.
        </Text>
        <Text size="xs" c="dimmed">
          Only views you created yourself appear here; views added from a share link are not
          available as feeds.
        </Text>

        <Group justify="space-between" align="center" wrap="nowrap">
          <Group gap={6}>
            <IconBrandApple size={16} aria-hidden />
            <IconBrandAndroid size={16} aria-hidden />
            <Text size="sm" c="dimmed">
              Subscribable from both platforms
            </Text>
          </Group>
          <Badge variant="light">iOS &amp; Android</Badge>
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
            You haven&apos;t created a calendar view yet. Create one on the Calendar page, then
            come back here.
          </Text>
        ) : (
          <>
            <Select
              label="View"
              description="The feed shows only this view's events — its calendars, people, event types, event-name filter and title style — and it updates when you edit the view."
              allowDeselect={false}
              data={feedLinks.map((link) => ({
                value: link.viewId,
                label: `${link.viewName} (${link.kind})`,
              }))}
              value={feedViewId || null}
              onChange={(value) => setFeedViewId(value ?? "")}
            />
            {selectedFeed && (
              <Text size="xs" c="dimmed">
                Filtered to: {selectedFeed.filterSummary}
              </Text>
            )}
            {selectedFeed && (
              <>
                <Code block style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
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
          </>
        )}

        <Divider />

        <Stack gap={4}>
          <Text size="sm" fw={600}>
            How to add it
          </Text>
          <Text size="xs" c="dimmed">
            <Text span fw={600}>
              iPhone / iPad:
            </Text>{" "}
            Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar →
            paste the HTTPS URL, then add the Calendar widget and select “Cloudy2 ·{" "}
            {selectedFeed?.viewName ?? "view"}”. Mac: Calendar → File → New Calendar
            Subscription.
          </Text>
          <Text size="xs" c="dimmed">
            <Text span fw={600}>
              Android:
            </Text>{" "}
            in Google Calendar on the web (calendar.google.com) → Other calendars → + → From
            URL → paste the HTTPS URL, then add the Google Calendar widget and select it.
            Google refreshes subscribed feeds about every 12–24 hours — for faster updates,
            subscribe in a calendar app that supports ICS (e.g. Samsung Calendar, Business
            Calendar, DigiCal, aCalendar) and use that app&apos;s widget.
          </Text>
          <Text size="xs" c="dimmed">
            Apple Calendar refreshes subscriptions roughly hourly (configurable). If a
            department calendar is also enabled, hide it to avoid duplicate copies.
          </Text>
        </Stack>
      </Stack>
    </MotionModal>
  );
}
