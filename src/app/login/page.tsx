import type { Metadata } from "next";
import { headers } from "next/headers";

import { LoginForm } from "@/components/LoginForm";
import { detectLegacyBrowser } from "@/lib/browserSupport";

import { UnsupportedBrowserNotice } from "./UnsupportedBrowserNotice";

export const metadata: Metadata = {
  title: "Sign in — Cloudy",
};

export default async function LoginPage() {
  // The stack's compiled client bundle only runs on browsers at or above the
  // Next 16 / React 19 floor (Safari 16.4 / Chrome 111 / Firefox 111 / Edge
  // 111). Below it, the page paints but never hydrates — the form renders,
  // but buttons and toggles do nothing. The gate is therefore server-side
  // (a client-side check would itself need the broken engine), and scoped to
  // this route: it reads `User-Agent`, which makes /login dynamic, and that
  // is acceptable for a public, unauthenticated page — it must NOT move into
  // the root layout, where it would break the PWA invariant that the start
  // URL answers with the precached shell. Fail-open detection: docs/browser-support.md
  const h = await headers();
  if (detectLegacyBrowser(h.get("user-agent"))) {
    return <UnsupportedBrowserNotice />;
  }
  return <LoginForm />;
}
