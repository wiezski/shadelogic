/* ZeroRemake — Service Worker for Web Push notifications.
 *
 * Registered from lib/push.ts on the client. Handles:
 *   - 'push'             — payload arrives, show notification
 *   - 'notificationclick'— deep-link to the URL in the payload
 *
 * Intentionally minimal: no offline caching, no routing mods. The
 * only job is to receive pushes and handle taps.
 */

self.addEventListener("install", (event) => {
  // Activate immediately on install so new versions don't require
  // a page reload to take effect.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "ZeroRemake", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "ZeroRemake";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/icon-192.png",
    tag: data.tag || data.kind || "zr",
    // Re-alert when a new push with the same tag arrives
    renotify: true,
    data: {
      url: data.url || "/",
      kind: data.kind || null,
    },
    // Allow swipe-to-dismiss without marking as acted on
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";

  // Focus an existing window on our origin if open, else open a new one.
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          // If an existing tab is on our origin, route it and focus.
          try {
            const clientUrl = new URL(client.url);
            if (clientUrl.origin === self.location.origin) {
              client.navigate(url);
              return client.focus();
            }
          } catch (e) { /* ignore */ }
        }
        return self.clients.openWindow(url);
      })
  );
});
