// Bump VERSION on deploy to force old caches to be evicted.
const VERSION = 'v2';
const CACHE = `groceries-${VERSION}`;

// Precached on install so the app shell boots offline on first repeat visit.
const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/apple-touch-icon.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Let cross-origin requests (Supabase, etc.) pass through untouched.
  if (url.origin !== self.location.origin) return;

  // Navigation: network-first, fall back to cached '/' so SPA routes work offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('/')))
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// =============================================================================
// Web Push
// =============================================================================
// Payload contract (JSON, sent by the `send-push` edge function):
//   { kind: 'shopping-day', listId, listTitle }
//   { kind: 'ack',          listId, listTitle, ackerName }

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { kind: 'shopping-day', listTitle: '' };
  }

  const isAck = payload.kind === 'ack';
  const title = isAck
    ? `🧺 ${payload.ackerName || 'Someone'} acknowledged`
    : '🧺 Today is a shopping day';
  const body = isAck
    ? `They saw the "${payload.listTitle || 'shopping'}" list.`
    : `Open the "${payload.listTitle || 'shopping'}" list.`;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: isAck ? `ack-${payload.listId}` : `shopping-${payload.listId}`,
      data: payload,
      actions: isAck ? [] : [{ action: 'ack', title: 'OK' }],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  // Anything other than dismiss opens the app; the OK action also passes
  // ?ack=<listId> so the page can call the ack edge function on load.
  const url =
    event.action === 'ack' && data.listId
      ? `/?ack=${encodeURIComponent(data.listId)}`
      : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const target = new URL(url, self.location.origin).href;
      // Reuse an open tab if we have one — post a message so it can ack
      // without a full reload.
      for (const client of clients) {
        if ('focus' in client) {
          if (event.action === 'ack' && data.listId) {
            client.postMessage({ type: 'ack-list', listId: data.listId });
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
