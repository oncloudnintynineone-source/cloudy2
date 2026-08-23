"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/ErrorState";

/** Error boundary for the login page (no shell chrome — bare fallback). */
export default function LoginError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[cloudy2] login error", error);
  }, [error]);

  return <ErrorState onReset={() => reset()} />;
}
