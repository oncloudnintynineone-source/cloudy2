"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button, Center, Paper, PasswordInput, Stack, Text, Title } from "@mantine/core";

import { BUTTON_LOADER_PROPS } from "@/lib/theme";

export function LoginForm() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await signIn("credentials", { input, redirect: false });
      if (res?.error) {
        setError("Invalid credentials. Please try again.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Center mih="100dvh">
      <Paper withBorder radius="md" p="lg" shadow="sm" w="100%" maw={380}>
        <form onSubmit={onSubmit}>
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
                Cloud Calendar Movement
              </Text>
            </div>
            <PasswordInput
              label="Password / Phone + keyword"
              placeholder="Enter your credentials"
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              required
              autoFocus
            />
            {error && (
              <Text c="red" size="sm">
                {error}
              </Text>
            )}
            <Button type="submit" loading={loading} loaderProps={BUTTON_LOADER_PROPS} fullWidth>
              Sign in
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
