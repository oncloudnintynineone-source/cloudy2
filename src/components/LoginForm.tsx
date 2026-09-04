"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button, PasswordInput, SegmentedControl, Stack, Text, TextInput } from "@mantine/core";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { invalidateCurrentPathCaches } from "@/lib/pwa/client";

export type LoginMode = "staff" | "admin";

interface LoginFormProps {
  initialMode?: LoginMode;
}

/**
 * Two explicit sign-in surfaces on one page:
 * - Staff: a single `[phone]<keyword>` input (`mode: "staff"`).
 * - Admin: named admins sign in with phone + the shared admin PIN; the
 *   phone-less break-glass root leaves the phone blank and enters the
 *   bootstrap password (`mode: "admin"`).
 * Both submit to the same Credentials provider, which re-checks the mode.
 */
export function LoginForm({ initialMode = "staff" }: LoginFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>(initialMode);
  const [input, setInput] = useState("");
  const [phone, setPhone] = useState("");
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleModeChange(next: string) {
    const nextMode: LoginMode = next === "admin" ? "admin" : "staff";
    setMode(nextMode);
    setError(null);
    // Keep the deep link in sync so a refresh (or a pasted URL) lands on the
    // same surface.
    router.replace(nextMode === "admin" ? "/login?mode=admin" : "/login", {
      scroll: false,
    });
  }

  async function submit(modeArg: LoginMode) {
    setError(null);
    setLoading(true);
    try {
      const credentials =
        modeArg === "admin" ? { mode: "admin", phone, secret } : { mode: "staff", input };
      const res = await signIn("credentials", { ...credentials, redirect: false });
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
    <Stack gap="md">
      <SegmentedControl
        fullWidth
        value={mode}
        onChange={handleModeChange}
        data={[
          { value: "staff", label: "Staff" },
          { value: "admin", label: "Admin" },
        ]}
        aria-label="Sign-in type"
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(mode);
        }}
      >
        <Stack gap="md">
          {mode === "staff" ? (
            <PasswordInput
              aria-label="Phone number plus login keyword"
              placeholder="Enter your phone number and keyword"
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              size="lg"
              required
              autoFocus
            />
          ) : (
            <>
              <Stack gap={4}>
                <TextInput
                  label="Phone number"
                  description="Your 8-digit roster phone. Leave blank to sign in as the emergency admin."
                  placeholder="91234567"
                  value={phone}
                  onChange={(e) => setPhone(e.currentTarget.value)}
                  size="lg"
                  autoFocus
                />
                <PasswordInput
                  label="Admin PIN or password"
                  description="Named admin: the shared admin PIN. Emergency admin: the bootstrap password."
                  placeholder="Enter your admin PIN or password"
                  value={secret}
                  onChange={(e) => setSecret(e.currentTarget.value)}
                  size="lg"
                  required
                  autoComplete="current-password"
                />
              </Stack>
            </>
          )}

          {error ? (
            <Text size="sm" c="red" role="alert">
              {error}
            </Text>
          ) : null}

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
    </Stack>
  );
}
