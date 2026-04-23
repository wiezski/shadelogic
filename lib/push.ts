/**
 * Web Push client helper.
 *
 * Usage from the app:
 *   import { enablePush, disablePush, pushState } from "@/lib/push";
 *
 *   const state = await pushState();          // "unsupported" | "denied" | "off" | "on" | "ios-install-needed"
 *   if (state === "off") await enablePush();  // prompts for permission, subscribes, POSTs /api/push/subscribe
 *   if (state === "on")  await disablePush(); // removes subscription
 *
 * No secrets in here — the VAPID PUBLIC key is baked in as env var
 * (NEXT_PUBLIC_VAPID_PUBLIC_KEY). The private key lives ONLY on the
 * server / Edge Function.
 */

export type PushState =
  | "unsupported"          // browser can't do web push at all
  | "ios-install-needed"   // iOS Safari before PWA install — user must Add to Home Screen first
  | "denied"               // user said no; can't prompt again without settings change
  | "off"                  // supported, permission not yet granted
  | "on";                  // subscribed and active

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS uses navigator.standalone; other platforms use display-mode
  const iOSStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
  const mediaStandalone = typeof window.matchMedia === "function"
    && window.matchMedia("(display-mode: standalone)").matches;
  return iOSStandalone || mediaStandalone;
}

/** Determine what the UI should show. Safe to call during render. */
export async function pushState(): Promise<PushState> {
  if (typeof window === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  if (isIosSafari() && !isStandalone()) return "ios-install-needed";

  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";

  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    if (!reg) return "off";
    const sub = await reg.pushManager.getSubscription();
    return sub ? "on" : "off";
  } catch {
    return "off";
  }
}

/** Register sw.js, request permission, subscribe, POST to /api/push/subscribe. */
export async function enablePush(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (typeof window === "undefined") return { ok: false, reason: "no-window" };

  const pubKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!pubKey) return { ok: false, reason: "vapid-key-not-configured" };

  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, reason: "unsupported" };
  }
  if (isIosSafari() && !isStandalone()) {
    return { ok: false, reason: "ios-install-needed" };
  }

  // Register (or retrieve) the service worker
  let reg: ServiceWorkerRegistration;
  try {
    reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
  } catch (e) {
    return { ok: false, reason: "sw-register-failed: " + (e as Error).message };
  }

  // Permission prompt
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: "denied" };

  // Subscribe
  let sub: PushSubscription;
  try {
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      sub = existing;
    } else {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // Cast through unknown to satisfy TS's ArrayBuffer/SharedArrayBuffer
        // strictness — the API accepts a Uint8Array at runtime in every
        // modern browser.
        applicationServerKey: urlBase64ToUint8Array(pubKey) as unknown as BufferSource,
      });
    }
  } catch (e) {
    return { ok: false, reason: "subscribe-failed: " + (e as Error).message };
  }

  // Persist to backend. Bearer token is the Supabase access token so
  // the API route can resolve the user server-side.
  const { supabase } = await import("./supabase");
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      subscription: sub.toJSON(),
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `save-failed: ${res.status} ${text}` };
  }

  return { ok: true };
}

/** Unsubscribe this device from the browser + the server. */
export async function disablePush(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (typeof window === "undefined") return { ok: false, reason: "no-window" };
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      // Best-effort tell the server
      const { supabase } = await import("./supabase");
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ endpoint }),
      });
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}
