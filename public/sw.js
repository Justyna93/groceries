// Bump VERSION on deploy to force old caches to be evicted.
const VERSION = 'v3';
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
// Payload contract (JSON, sent by the edge functions):
//   { kind: 'shopping-day', listIds: string[], listTitles: string[] }
//   { kind: 'ack',          listIds: string[], listTitles: string[], ackerName }
//
// Multiple lists for the same day are aggregated into one notification, and a
// date-keyed `tag` makes any later update replace the existing entry rather
// than stacking a second one.

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function joinTitles(titles) {
  return (titles || []).filter(Boolean).join(', ') || 'shopping';
}

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const isAck = payload.kind === 'ack';
  const titles = joinTitles(payload.listTitles);
  const title = isAck
    ? `🧺 ${payload.ackerName || 'Someone'} acknowledged`
    : '🧺 Today is a shopping day';
  const body = isAck ? `They saw ${titles}.` : `Open ${titles}.`;
  const today = todayIsoDate();

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: isAck ? `ack-${today}` : `shopping-${today}`,
      // Re-alert when an existing notification is replaced (e.g. a 2nd list
      // is added during the day). Without this, the browser would silently
      // swap the body and the user wouldn't notice.
      renotify: true,
      data: payload,
      actions: isAck ? [] : [{ action: 'ack', title: 'OK' }],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const ids = Array.isArray(data.listIds) ? data.listIds.join(',') : '';
  // Anything other than dismiss opens the app; the OK action also passes
  // ?ack=<listIds> so the page can call the ack edge function on load.
  const url =
    event.action === 'ack' && ids
      ? `/?ack=${encodeURIComponent(ids)}`
      : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const target = new URL(url, self.location.origin).href;
      for (const client of clients) {
        if ('focus' in client) {
          if (event.action === 'ack' && ids) {
            client.postMessage({ type: 'ack-list', listIds: data.listIds });
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
