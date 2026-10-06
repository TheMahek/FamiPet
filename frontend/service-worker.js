// =====================================================
// FAMIPET SERVICE WORKER (Phase 6 Web Push)
// =====================================================
// Registered at root scope (/service-worker.js) so it controls every Famipet
// page. Handles the push/notification lifecycle:
//   - `push`       : server sends a structured payload → show a notification
//   - `notificationclick` : user taps/opens → focus or open the target page
//   - `pushsubscriptionchange` : old subscription expired → unregister it
//                                 (the browser will surface a re-subscribe
//                                 prompt next time the user opens the site)
// No caching strategy is installed here: Famipet is a static site served
// through Cloudflare; aggressive SW caching would make UI updates flaky.
'use strict';

const APP_SCOPE = '/';
const NOTIFICATION_DEFAULTS = {
  icon: '/assets/logos/Logo.png',
  badge: '/assets/logos/Logo.png',
  tag: 'famipet-notification',
  renotify: true,
  vibrate: [120, 60, 120],
  data: {
    url: '/pages/dashboard.html',
  },
};

self.addEventListener('install', (event) => {
  // A new SW version takes over as soon as it finishes installing — Famipet
  // ships no caches to version, so skipping waiting avoids a stuck old worker.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Let this worker control already-open tabs immediately.
      await self.clients.claim();
    })()
  );
});

/**
 * Push delivery target. The backend always sends JSON:
 *   { title, body?, tag?, data: { url, notificationId, type, category } }
 */
self.addEventListener('push', (event) => {
  let payload = null;
  try {
    payload = event.data ? event.data.json() : null;
  } catch (err) {
    console.warn('[SW] invalid push payload:', err.message);
  }

  const title = (payload && payload.title) || 'Famipet';
  const options = {
    body: (payload && payload.body) || '',
    ...NOTIFICATION_DEFAULTS,
  };

  if (payload && payload.tag) options.tag = payload.tag;
  if (payload && payload.data) {
    options.data = { ...NOTIFICATION_DEFAULTS.data, ...payload.data };
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = new URL(
    (event.notification.data && event.notification.data.url) || '/pages/dashboard.html',
    self.location.origin
  ).href;

  event.waitUntil(
    (async () => {
      // Focus an existing tab matching the target, else open a new one.
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of allClients) {
        const url = new URL(client.url);
        if (url.origin === self.location.origin && url.pathname === targetUrl.pathname) {
          await client.focus();
          if (targetUrl.search) client.navigate(targetUrl);
          return;
        }
      }
      await self.clients.openWindow(targetUrl);
    })()
  );
});

self.addEventListener('notificationclose', (event) => {
  event.notification.close();
});

// The push service dropped our subscription (rotated keys, expired). Tell the
// backend to forget it so it stops pushing to a dead endpoint. A re-subscribe
// happens on the next user action via push.js (never automatically).
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const subscription = event.newSubscription || event.oldSubscription || null;
        if (!subscription || !subscription.endpoint) return;
        await fetch('/api/push/unsubscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          // The browser attaches credentials for same-origin requests; the
          // Authorization header is added by push.js when re-subscribing.
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
      } catch (err) {
        console.warn('[SW] pushsubscriptionchange cleanup failed:', err.message);
      }
    })()
  );
});