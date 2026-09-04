import { Center, Paper, Stack, Text, Title } from "@mantine/core";

/**
 * Server-rendered replacement for the login form on browsers below the app's
 * supported engine floor (Safari 16.4 / Chrome 111 — see
 * docs/browser-support.md). On those engines the client JS can never hydrate,
 * so this must be plain SSR HTML with no client interactivity: a client
 * component (or banner) could never appear on the browsers it targets.
 */
export function UnsupportedBrowserNotice() {
  return (
    <Center mih="100dvh">
      <Paper withBorder radius="md" p="lg" shadow="sm" w="100%" maw={{ base: 380, lg: 440 }}>
        <Stack>
          <div>
            <div
              style={{
                width: 40,
                height: 4,
                borderRadius: 999,
                background: "var(--mantine-color-accent-6)",
                marginBottom: 8,
              }}
            />
            <Title order={2} c="brand">
              Cloudy
            </Title>
            <Text c="dimmed" size="sm">
              Cloud Group Parade State
            </Text>
          </div>
          <Text fw={600}>This browser is too old for Cloudy to run</Text>
          <Text c="dimmed" size="sm">
            Cloudy requires a modern browser — Safari 16.4 (iOS 16.4) or newer on Apple devices, or
            a current Chrome, Edge, or Firefox (version 111+). Your browser can&apos;t run the app,
            so you see this notice instead of the sign-in form. Updating your browser or device is
            the only way to sign in.
          </Text>
        </Stack>
      </Paper>
    </Center>
  );
}
