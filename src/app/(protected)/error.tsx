"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/ErrorState";

/**
 * Route error boundary for all authenticated pages. Renders inside the
 * protected shell, so the sidebar/bottom nav stay visible while the page
 * segment shows this fallback; `reset()` retries the failed segment.
 */
export default function ProtectedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[cloudy2] route error", error);
  }, [error]);

  return <ErrorState onReset={() => reset()} />;
}
