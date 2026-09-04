"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button, PasswordInput, Stack } from "@mantine/core";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { invalidateCurrentPathCaches } from "@/lib/pwa/client";

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
      void invalidateCurrentPathCaches().then(() => router.refresh());
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Stack gap="md">
        <PasswordInput
          aria-label="Admin password or phone number plus login keyword"
          placeholder="Enter your credentials"
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
          // Rendered in Mantine's error slot under the input (wired to
          // it via aria-describedby) instead of a detached red Text.
          error={error ?? undefined}
          size="lg"
          required
          autoFocus
        />
        <Button
          type="submit"
          loading={loading}
          loaderProps={BUTTON_LOADER_PROPS}
          fullWidth
          size="lg"
        >
          Sign in
        </Button>
      </Stack>
    </form>
  );
}
