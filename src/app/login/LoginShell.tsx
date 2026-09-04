import { Center, Image, Paper, Stack, Title } from "@mantine/core";

/**
 * Shared visual shell for the public login page. Server-safe (no client
 * hooks), so it can wrap both the client <LoginForm /> and the server-only
 * <UnsupportedBrowserNotice /> and keep the two branches looking identical:
 * a navy backdrop echoing the app header (brand-7 → brand-9) behind a normal
 * in-app style card — opaque, bordered, subtle shadow — carrying the app
 * icon and wordmark. Styling lives in the `c2-login-*` rules in globals.css;
 * the card takes the scheme's body color so it matches every other surface
 * in the app.
 */
export function LoginShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="c2-login-wrap">
      <Center className="c2-login-center">
        <Paper className="c2-login-card" radius="md" p={{ base: "lg", lg: "xl" }} withBorder>
          <Stack gap="md">
            <Stack gap="xs" align="center" ta="center">
              <Image
                src="/icon.svg"
                alt=""
                className="c2-login-icon"
                draggable={false}
              />
              <div>
                <Title order={2} c="brand">
                  Cloudy
                </Title>
                <div className="c2-login-rule" aria-hidden />
              </div>
            </Stack>
            {children}
          </Stack>
        </Paper>
      </Center>
    </div>
  );
}
