"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button, Modal, PasswordInput, Stack, Text } from "@mantine/core";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { invalidateCurrentPathCaches } from "@/lib/pwa/client";
import { resolveLogin } from "@/lib/loginActions";

/**
 * Single clean login field: one masked input + Sign in. Submitting routes the
 * attempt:
 * - a regular user (`[phone]<keyword>`) is signed in immediately;
 * - the phone-less emergency admin (the input has no keyword) is signed in
 *   immediately against the root password;
 * - an admin-role user (phone + keyword) is asked for the shared admin PIN in a
 *   modal before the admin session is issued.
 * The routing probe (`resolveLogin`) is a hint only — `authorize` re-checks
 * every credential and remains the sole session issuer and audit point.
 */
export function LoginForm() {
  const router = useRouter();
  const fieldRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Non-null while the shared-admin-PIN modal is open for that phone.
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  function completeLogin() {
    router.push("/dashboard");
    void invalidateCurrentPathCaches().then(() => router.refresh());
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) {
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const route = await resolveLogin(input);

      // Admin-role users need the shared PIN before any session is issued.
      if (route.kind === "admin") {
        setPendingPhone(route.phone);
        return;
      }

      const res =
        route.kind === "root-candidate"
          ? await signIn("credentials", {
              mode: "admin",
              phone: "",
              secret: input,
              redirect: false,
            })
          : await signIn("credentials", { mode: "staff", input, redirect: false });

      if (res?.error) {
        setError("Invalid credentials. Please try again.");
        return;
      }
      completeLogin();
    } finally {
      setLoading(false);
    }
  }

  async function submitPin() {
    if (pinLoading || !pendingPhone) {
      return;
    }
    setPinError(null);
    setPinLoading(true);
    try {
      const res = await signIn("credentials", {
        mode: "admin",
        phone: pendingPhone,
        secret: pin,
        redirect: false,
      });
      if (res?.error) {
        setPinError("Invalid admin PIN. Please try again.");
        return;
      }
      setPendingPhone(null);
      completeLogin();
    } finally {
      setPinLoading(false);
    }
  }

  function cancelPin() {
    setPendingPhone(null);
    setPin("");
    setPinError(null);
    setError(null);
    setInput("");
    fieldRef.current?.focus();
  }

  return (
    <>
      <form onSubmit={onSubmit}>
        <Stack gap="md">
          <PasswordInput
            ref={fieldRef}
            aria-label="Password or phone number plus login keyword"
            placeholder="Enter your credentials"
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
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

      <Modal
        opened={pendingPhone !== null}
        onClose={cancelPin}
        title="Admin sign-in"
        centered
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm">Enter the shared admin PIN to continue.</Text>
          <PasswordInput
            aria-label="Admin PIN"
            value={pin}
            onChange={(e) => setPin(e.currentTarget.value)}
            error={pinError ?? undefined}
            autoFocus
            autoComplete="current-password"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                void submitPin();
              }
            }}
          />
          <Button
            onClick={() => void submitPin()}
            loading={pinLoading}
            loaderProps={BUTTON_LOADER_PROPS}
            fullWidth
          >
            Continue
          </Button>
        </Stack>
      </Modal>
    </>
  );
}
