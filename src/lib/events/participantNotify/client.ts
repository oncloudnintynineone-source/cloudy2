"use client";

import { useEffect } from "react";

import { syncPushSubscription, type ClientPushSubscription } from "./actions";

/**
 * Browser-side Web Push plumbing for the participant notification feature:
 * capability detection, the VAPID application-server key, and subscribe/
 * unsubscribe against the controlling service worker's `pushManager`. The
 * server actions in `./actions.ts` persist the subscription per signed-in
 * account; this module only manipulates the browser side.
 *
 * iOS caveat: Web Push works only on the installed home-screen web app
 * (iOS/iPadOS 16.4+, matching the app's browser floor), never in Safari
 * browser tabs. `Notification.requestPermission()` there must be called inside
 * the user gesture (a button tap) — never after an `await` — so callers invoke
 * {@link requestPushPermission} before any other await.
 */

/** The VAPID public key inlined at build time, or null when push is unconfigured. */
export function clientVapidPublicKey(): string | null {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  return typeof key === "string" && key.trim() ? key.trim() : null;
}

/** Whether this browser can do Web Push at all (secure context + SW + API). */
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    clientVapidPublicKey() !== null
  );
}

/** The current push permission state, or null when Web Push is unsupported. */
export function pushPermissionState(): NotificationPermission | null {
  if (!pushSupported() || typeof Notification === "undefined") {
    return null;
  }
  return Notification.permission;
}

/** Convert a URL-safe base64 VAPID key to the Uint8Array PushManager wants. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64WithPadding = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64WithPadding);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Ask for the notification permission. MUST be called synchronously from a
 * user-gesture handler (Safari iOS rejects it otherwise).
 */
export async function requestPushPermission(): Promise<NotificationPermission> {
  return Notification.requestPermission();
}

/** How far this device's push plumbing got, used to show a specific message. */
export type PushSwState = "unsupported" | "ok" | "missing" | "timeout";

/** How long to wait for the service worker to become ready before giving up. */
const SW_READY_TIMEOUT_MS = 8000;

/**
 * Resolve the controlling service worker registration without ever hanging:
 * a present registration is used immediately; only when none exists do we wait
 * on `navigator.serviceWorker.ready`, raced against a timeout (an installed-but-
 * never-activating worker would otherwise block the caller forever). Resolves
 * null on timeout / no registration / unsupported — callers then show guidance
 * instead of an eternal spinner.
 */
export async function pushSwState(): Promise<PushSwState> {
  if (!pushSupported()) {
    return "unsupported";
  }
  const existing = await findExistingRegistration();
  if (existing) {
    return "ok";
  }
  try {
    const ready = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), SW_READY_TIMEOUT_MS);
      }),
    ]);
    return ready ? "ok" : "timeout";
  } catch {
    return "missing";
  }
}

/**
 * A registration whose scope covers this page, polling briefly before giving
 * up: on the very first launch after an install the service worker may still
 * be registering while the UI asks for push state, so a single synchronous
 * probe can miss it even though it becomes ready a beat later.
 */
async function findExistingRegistration(): Promise<ServiceWorkerRegistration | null> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        return registration;
      }
    } catch {
      return null;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
}

/**
 * The registration to subscribe/send against, or null when the service worker
 * is not reachable on this device (see {@link pushSwState}).
 */
async function serviceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  const state = await pushSwState();
  if (state !== "ok") {
    return null;
  }
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      return registration;
    }
    return (await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), SW_READY_TIMEOUT_MS);
      }),
    ])) as ServiceWorkerRegistration | null;
  } catch {
    return null;
  }
}

/** This device's current push subscription (browser-side), or null. */
export async function currentPushSubscription(): Promise<PushSubscription | null> {
  const registration = await serviceWorkerRegistration();
  if (!registration) {
    return null;
  }
  try {
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/**
 * Subscribe this device to push (no permission prompt — the caller must have
 * already obtained it via {@link requestPushPermission}). Returns the
 * subscription, or null when the service worker is unreachable or the
 * subscription could not be created.
 */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  const publicKey = clientVapidPublicKey();
  if (!publicKey) {
    return null;
  }
  const registration = await serviceWorkerRegistration();
  if (!registration) {
    return null;
  }
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    return existing;
  }
  try {
    return await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  } catch (error) {
    // InvalidStateError: an existing subscription on another key is in the
    // way, or the registration isn't activatable yet.
    console.error("[push] Subscribe failed", error);
    return null;
  }
}

/** Unsubscribe this device from push (no-op when not subscribed/reachable). */
export async function unsubscribeFromPush(): Promise<boolean> {
  const registration = await serviceWorkerRegistration();
  if (!registration) {
    return false;
  }
  try {
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      return false;
    }
    return subscription.unsubscribe();
  } catch {
    return false;
  }
}

/** Pull a subscription's `{ endpoint, keys }` for the server action. */
export function subscriptionPayload(
  subscription: PushSubscription,
): ClientPushSubscription | null {
  const p256dh = subscription.getKey("p256dh");
  const auth = subscription.getKey("auth");
  if (!p256dh || !auth) {
    return null;
  }
  const toBase64Url = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  return {
    endpoint: subscription.endpoint,
    keys: { p256dh: toBase64Url(p256dh), auth: toBase64Url(auth) },
  };
}

/**
 * Best-effort repair of this device's stored push subscription. A browser or
 * push service can refresh/rotate/drop a subscription at any time, and the
 * update flow unregisters the worker on every deploy — either leaves the
 * server holding a dead endpoint (its next send 404/410s and prunes the row,
 * so the device silently stops receiving). This re-subscribes when the browser
 * has none (permission is already granted, so no prompt) and re-syncs the
 * current endpoint/keys to the server. Never throws; returns whether it
 * succeeded.
 */
export async function repairPushSubscription(): Promise<boolean> {
  if (!pushSupported() || pushPermissionState() !== "granted") {
    return false;
  }
  if ((await pushSwState()) !== "ok") {
    return false;
  }
  try {
    let subscription = await currentPushSubscription();
    if (!subscription) {
      subscription = await subscribeToPush();
    }
    if (!subscription) {
      return false;
    }
    const payload = subscriptionPayload(subscription);
    if (!payload) {
      return false;
    }
    const result = await syncPushSubscription(payload);
    return result.ok;
  } catch {
    return false;
  }
}

// One repair per hour per document is plenty: the sync is an idempotent upsert
// and a fresh page load (a deploy's reload) starts a clean window.
const REPAIR_THROTTLE_MS = 60 * 60 * 1000;

// Module scope, not a ref: a document load gets a clean throttle window and
// React's dev-mode double effect invocation cannot double-count it.
let lastRepairAt = 0;

/**
 * Mounted once in the protected shell. Repairs this device's push subscription
 * on load (so a deploy's unregister→reload self-heals immediately) and on
 * every return-to-foreground, throttled. Fire-and-forget; a device that never
 * enabled push, or one without permission, is a no-op.
 */
export function usePushSubscriptionRepair(): void {
  useEffect(() => {
    const repair = () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return;
      }
      const now = Date.now();
      if (now - lastRepairAt < REPAIR_THROTTLE_MS) {
        return;
      }
      lastRepairAt = now;
      void repairPushSubscription().catch(() => {});
    };

    repair();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        repair();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);
}
