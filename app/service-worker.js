"use strict";

const CACHE_NAME = "overuurtje-app-v51";
const APP_SHELL = [
  "./",
  "./index.html",
  "./dashboard.html",
  "./account.html",
  "./uitleg-werkregels.html",
  "./workdays.html",
  "./projects.html",
  "./wat-is-overuurtje.html",
  "./privacy.html",
  "./terms.html",
  "./styles.css",
  "./runtime-config.js",
  "./calculator.js",
  "./analytics.js",
  "./interactionGuard.js",
  "./selectUi.js",
  "./timePicker.js",
  "./liveWorkday.js",
  "./workdayNotifications.js",
  "./statsEngine.js",
  "./app.js",
  "./dashboard.js",
  "./account.js",
  "./workdays.js",
  "./projects.js",
  "./pwa.js",
  "./saas/config.js",
  "./saas/supabaseClient.js",
  "./saas/pushService.js",
  "./saas/authService.js",
  "./saas/profileService.js",
  "./saas/settingsService.js",
  "./saas/functionService.js",
  "./saas/equipmentService.js",
  "./saas/projectService.js",
  "./saas/workdayService.js",
  "./saas/shareService.js",
  "./qrCode.js",
  "./saas/shareUi.js",
  "./saas/subscriptionService.js",
  "./saas/featureGate.js",
  "./saas/sessionUi.js",
  "./vendor/jsQR.js",
  "./qrScanner.js",
  "./background.png",
  "./overuurtje-logo.png",
  "./favicon.ico",
  "./favicon-16x16.png",
  "./favicon-32x32.png",
  "./favicon.png",
  "./apple-touch-icon.png",
  "./icon-192.png",
  "./icon-512.png",
  "./site.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("overuurtje-app-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, fallbackUrl = null) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request, { ignoreSearch: true }))
      || (fallbackUrl ? await cache.match(fallbackUrl, { ignoreSearch: true }) : null)
      || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/.netlify/functions/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "./index.html"));
    return;
  }

  if (["script", "style", "worker"].includes(request.destination)
    || url.pathname.endsWith("runtime-config.js")) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (["image", "font"].includes(request.destination)
    || url.pathname.endsWith(".webmanifest")
    || url.pathname.endsWith(".ico")) {
    event.respondWith(cacheFirst(request));
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "./", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      const exact = clients.find((client) => client.url === targetUrl && "focus" in client);
      if (exact) return exact.focus();
      const existing = clients.find((client) => "navigate" in client && "focus" in client);
      if (existing) {
        await existing.navigate(targetUrl);
        return existing.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = { body: event.data?.text() || "Je hebt een nieuw bericht." };
  }

  event.waitUntil(self.registration.showNotification(payload.title || "Overuurtje.nl", {
    body: payload.body || "Je hebt een nieuw bericht.",
    icon: "./icon-192.png",
    badge: "./favicon-32x32.png",
    tag: payload.tag || payload.notificationId || "overuurtje-notification",
    renotify: Boolean(payload.renotify),
    data: {
      url: payload.url || "./",
      notificationId: payload.notificationId || null
    }
  }));
});
