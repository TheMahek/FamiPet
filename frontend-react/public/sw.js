/* eslint-disable no-undef */
/**
 * FamiPet service worker — native Push API only.
 *
 * Deliberately hand-written and dependency-free: no Workbox, no
 * vite-plugin-pwa, no precache manifest. This file only has to do
 * three things, and a generated one would do them worse.
 *
 *  1. `push`               — show a notification for a payload sent by
 *                            backend/services/push.service.js. The
 *                            payload is deliberately small (title,
 *                            body, tag, url, notificationId) and
 *                            carries no pet, health or owner data.
 *                            Everything is read defensively because a
 *                            payload can be empty, partial or not JSON.
 *  2. `notificationclick`  — focus an existing app tab and deep-link
 *                            into it, so a push is a shortcut to the
 *                            place in the app it is about, not a
 *                            duplicate window. Falls back to opening
 *                            the app when nothing is open.
 *  3. `pushsubscriptionchange`
 *                         — re-subscribe when the browser rotates the
 *                            push keys, so the user never has to
 *                            toggle push off and on again. The new
 *                            subscription must be POSTed to the
 *                            authenticated API, and a service worker
 *                            holds no auth token (the app uses a
 *                            Bearer token in localStorage), so this
 *                            worker never talks to the API itself: it
 *                            takes the VAPID key and hands the fresh
 *                            subscription to an open app tab, which
 *                            stores it with the user's token. The
 *                            token never reaches the worker. If no tab
 *                            can help, the dead subscription is
 *                            dropped rather than kept failing on the
 *                            server.
 *
 * No fetch/precache handler on purpose — this worker must never
 * intercept the app's network traffic.
 */

// This worker never calls the FamiPet API: every request it would need is
// authenticated, and a service worker holds no auth token. The page does
// the API work, this worker does the push work.

// The VAPID public key, posted in by the app. Not a secret (every
// browser gets it) but it is only obtainable from an authenticated
// endpoint, so it arrives via the page rather than being hardcoded.
let vapidPublicKey = '';

// How long to wait for an open tab to answer with the VAPID key, and
// for that tab to store a rotated subscription.
const VAPID_KEY_TIMEOUT_MS = 3000;
const SUBSCRIPTION_HANDOFF_TIMEOUT_MS = 5000;

/* ---------------- helpers ---------------- */

// Read a possibly-missing value without ever throwing.
function field(source, name) {
  if (!source || typeof source !== 'object') return '';
  const value = source[name];
  return typeof value === 'string' ? value : '';
}

// Only same-origin in-app paths are deep-linked; anything else
// (absolute URL, protocol-relative) is discarded, so a push can never
// be used to navigate the user off the app.
function safeUrl(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw || raw.charAt(0) !== '/' || raw.indexOf('//') === 0) return '/app/dashboard';
  return raw;
}

// The push body can be a JSON string or plain text.
function parsePayload(event) {
  if (!event.data) return {};
  let raw = '';
  try {
    raw = event.data.text();
  } catch {
    return {};
  }
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return { body: raw };
  }
}

// Ask an open app tab for the VAPID public key. The tab is
// authenticated; this worker is not. Resolves '' when no tab answers.
function requestVapidKey() {
  if (vapidPublicKey) return Promise.resolve(vapidPublicKey);

  return self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((clientList) => {
      if (!clientList.length) return '';

      return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(vapidPublicKey), VAPID_KEY_TIMEOUT_MS);
        const onMessage = (event) => {
          if (!event.data || event.data.type !== 'FAMIPET_VAPID_PUBLIC_KEY') return;
          clearTimeout(timer);
          self.removeEventListener('message', onMessage);
          vapidPublicKey = typeof event.data.publicKey === 'string' ? event.data.publicKey : '';
          resolve(vapidPublicKey);
        };
        self.addEventListener('message', onMessage);
        for (const client of clientList) client.postMessage({ type: 'FAMIPET_REQUEST_VAPID_KEY' });
      });
    })
    .catch(() => '');
}

// Hand the rotated subscription to an open app tab, which is the only
// side that holds the Bearer token needed to store it. The token itself
// never crosses this boundary. Exactly one tab is asked, so the save is
// not attempted N times by every open window.
function handOffSubscription(subscription) {
  return self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((clientList) => {
      const client = clientList.find((candidate) => {
        try {
          return new URL(candidate.url).origin === self.location.origin;
        } catch {
          return false;
        }
      });
      if (!client) throw new Error('no app tab available to store the rotated subscription');

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          self.removeEventListener('message', onMessage);
          reject(new Error('timed out waiting for the app to store the rotated subscription'));
        }, SUBSCRIPTION_HANDOFF_TIMEOUT_MS);

        const onMessage = (event) => {
          const data = event.data;
          if (!data || (data.type !== 'FAMIPET_PUSH_SUBSCRIPTION_SAVED' && data.type !== 'FAMIPET_PUSH_SUBSCRIPTION_FAILED')) return;
          clearTimeout(timer);
          self.removeEventListener('message', onMessage);
          if (data.type === 'FAMIPET_PUSH_SUBSCRIPTION_SAVED') resolve();
          else reject(new Error('the app could not store the rotated subscription'));
        };

        self.addEventListener('message', onMessage);
        client.postMessage({
          type: 'FAMIPET_PUSH_SUBSCRIPTION_CHANGED',
          subscription: subscription.toJSON(),
        });
      });
    });
}

// urlBase64ToUint8Array, inlined: the one helper a manual worker needs.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = self.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// The app hands the key over as soon as it has fetched it.
self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'FAMIPET_VAPID_PUBLIC_KEY') return;
  vapidPublicKey = typeof event.data.publicKey === 'string' ? event.data.publicKey : '';
});

/* ---------------- push ---------------- */

self.addEventListener('push', (event) => {
  const data = parsePayload(event);

  event.waitUntil(
    self.registration.showNotification(field(data, 'title') || 'FamiPet', {
      body: field(data, 'body'),
      // One notification per type collapses a burst instead of
      // stacking a wall of near-identical alerts.
      tag: field(data, 'tag') || 'famipet',
      icon: '/assets/logos/Famipet.png',
      badge: '/assets/logos/Famipet.png',
      data: { url: safeUrl(field(data, 'url')), notificationId: field(data, 'notificationId') },
    })
  );
});

/* ---------------- notification click ---------------- */

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const target = safeUrl(event.notification.data && event.notification.data.url);

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

      for (const client of clientList) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        if (!('focus' in client)) continue;
        // Deep-link the tab that is already open instead of opening a
        // second copy of the app.
        const focused = await client.focus();
        if (focused && 'navigate' in focused) await focused.navigate(target);
        return undefined;
      }

      return self.clients.openWindow(target);
    })().catch(() => self.clients.openWindow(target))
  );
});

/* ---------------- subscription rotation ---------------- */

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const publicKey = await requestVapidKey();
        if (!publicKey) throw new Error('no VAPID public key available');

        const subscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
        if (!subscription) throw new Error('re-subscribe returned nothing');

        await handOffSubscription(subscription);
      } catch {
        // A dead subscription is worse than none: drop it so the
        // server stops counting delivery failures against it.
        const existing = await self.registration.pushManager.getSubscription();
        if (existing) await existing.unsubscribe();
      }
    })()
  );
});
