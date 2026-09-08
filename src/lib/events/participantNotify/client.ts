"use client";

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

/** The registration that controls this page (the Serwist SW, scope "/"). */
async function serviceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.ready;
  if (!registration || !registration.pushManager) {
    throw new Error("Push is not available on this device");
  }
  return registration;
}

/** This device's current push subscription (browser-side), or null. */
export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) {
    return null;
  }
  const registration = await serviceWorkerRegistration();
  return registration.pushManager.getSubscription();
}

/**
 * Subscribe this device to push (no permission prompt — the caller must have
 * already obtained it via {@link requestPushPermission}). Returns the
 * subscription, or null when already-subscribed state could not be (re)used.
 */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  const publicKey = clientVapidPublicKey();
  if (!publicKey) {
    return null;
  }
  const registration = await serviceWorkerRegistration();
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
    // way — drop it and retry once.
    console.error("[push] Subscribe failed", error);
    return null;
  }
}

/** Unsubscribe this device from push (no-op when not subscribed). */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!pushSupported()) {
    return false;
  }
  const registration = await serviceWorkerRegistration();
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    return false;
  }
  return subscription.unsubscribe();
}
