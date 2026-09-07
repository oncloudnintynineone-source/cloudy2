"use client";

import { useCallback, useRef, useState } from "react";
import { ActionIcon, Menu, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCalendarPlus, IconLogout, IconRefresh, IconUser } from "@tabler/icons-react";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";

import { MOTION } from "@/lib/motion/timing";
import { clearAllSavedPages } from "@/lib/pwa/client";
import { clearUiState } from "@/lib/ui/uiStateClient";

import { useReportActivity } from "./ActivityBar";
import { CalendarAccessModal } from "./CalendarAccessModal";

interface UserMenuProps {
  /** The user's full display name. */
  name: string;
  role: "admin" | "user";
  phone: string | null;
  /**
   * Whether the Google Calendar integration is configured (env-backed). On the
   * dashboard a forced refresh with Google unconfigured would cache empties and
   * blank the grid, so the item is disabled there; other pages just reload.
   */
  googleConfigured: boolean;
}

/**
 * Sign-out is a hard navigation: next-auth's client clears the session cookie
 * through two uncacheable serverless round trips (GET /api/auth/csrf, then
 * POST /api/auth/signout) before `window.location.href` leaves for /login — on
 * a cold deployed function that reads as a dead page with no feedback. So the
 * click reports the global activity bar immediately, and this watchdog is the
 * last resort for the rare case where the fetches neither resolve nor reject
 * (hung function): the user still lands on /login instead of hanging forever.
 */
const SIGN_OUT_WATCHDOG_MS = 10_000;

export function UserMenu({ name, role, phone, googleConfigured }: UserMenuProps) {
  const [accessOpen, setAccessOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const roleLabel = role === "admin" ? "Admin" : "User";
  const subtitle = [roleLabel, phone].filter(Boolean).join(" · ");
  const pathname = usePathname();
  // The force-fresh semantics only exist on the calendar (the server honors the
  // nonce there); on every other page the item is still shown — the nonce URL
  // is never SW-cached, so the reload is a network-fresh render there too.
  const isDashboard = pathname === "/dashboard";
  // A full-page reload follows, so the menu's click closes and the page leaves;
  // the ref only stops a double-click from scheduling two navigations.
  const refreshScheduled = useRef(false);

  // The global amber activity bar mirrors the sign-out flight (the dropdown's
  // close and the hard navigation otherwise give no in-page signal until the
  // browser's own tab spinner appears on the way to /login).
  useReportActivity(loggingOut, "auth:signout");

  const handleForceRefresh = useCallback(() => {
    if (refreshScheduled.current) return;
    refreshScheduled.current = true;
    // One-shot nonce: reload the current URL with ?refresh=<epoch-ms>. The
    // service worker never caches URLs carrying it (ONE_SHOT_PARAMS), so this
    // is always a network render; on /dashboard the server parses the nonce
    // and force-reads Google. `useOneShotRefreshStrip` (AppShellShell) drops
    // the param right after the reloaded document mounts.
    const url = new URL(window.location.href);
    url.searchParams.set("refresh", String(Date.now()));
    window.location.assign(url.toString());
  }, []);

  const handleLogout = useCallback(async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    // The remembered-state cookie is per-device: drop it on sign-out so the
    // next account on this device starts from the defaults.
    clearUiState();
    const watchdog = window.setTimeout(() => {
      // Deliberate full-page leave (same rationale as AppProviders' session
      // expiry redirect): the sign-out POST clears the session cookie server-
      // side and the SW must not soft-navigate back onto cached account pages.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login");
    }, SIGN_OUT_WATCHDOG_MS);
    try {
      // Purge the page caches BEFORE the sign-out fetches/navigation so the SW
      // can never serve the previous user's cached calendar mid-transition.
      await clearAllSavedPages();
      // On success next-auth assigns window.location.href = "/login"; this page
      // is normally gone before the await settles, and the watchdog dies with it.
      await signOut({ callbackUrl: "/login" });
      window.clearTimeout(watchdog);
    } catch {
      window.clearTimeout(watchdog);
      setLoggingOut(false);
      notifications.show({
        color: "red",
        message: "Couldn't sign out — check your connection and try again",
      });
    }
  }, [loggingOut]);

  return (
    <>
      <Menu
        shadow="md"
        width={240}
        position="bottom-end"
        withinPortal
        transitionProps={{
          transition: "pop-top-right",
          duration: MOTION.popover,
          timingFunction: "ease",
        }}
      >
        <Menu.Target>
          <ActionIcon
            variant="transparent"
            c="white"
            size="lg"
            aria-label={loggingOut ? "Signing out" : "Profile"}
            loading={loggingOut}
            disabled={loggingOut}
            loaderProps={{ type: "oval" }}
          >
            <IconUser size={18} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          {/* Profile header: full display name, never truncated. */}
          <Stack gap={0} px="md" py="sm">
            <Text size="sm" fw={700}>
              {name}
            </Text>
            {subtitle && (
              <Text size="xs" c="dimmed">
                {subtitle}
              </Text>
            )}
          </Stack>
          <Menu.Divider />
          <Menu.Item
            leftSection={<IconRefresh size={16} />}
            disabled={loggingOut || (isDashboard && !googleConfigured)}
            onClick={handleForceRefresh}
          >
            Force refresh
          </Menu.Item>
          <Menu.Item
            leftSection={<IconCalendarPlus size={16} />}
            onClick={() => setAccessOpen(true)}
          >
            Calendar Access
          </Menu.Item>
          <Menu.Item
            leftSection={<IconLogout size={16} />}
            onClick={() => void handleLogout()}
          >
            Log out
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <CalendarAccessModal opened={accessOpen} onClose={() => setAccessOpen(false)} />
    </>
  );
}
