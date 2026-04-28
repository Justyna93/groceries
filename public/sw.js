// Bump VERSION on deploy to force old caches to be evicted.
const VERSION = 'v5';
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
  // iOS PWAs don't reliably fire `event.action` for tappable action buttons,
  // so we treat *any* click on a shopping-day notification as the ack — the
  // notification only ever exists to confirm the other person saw it.
  const isShoppingDay = data.kind === 'shopping-day';
  const shouldAck = isShoppingDay && ids;
  const url = shouldAck ? `/?ack=${encodeURIComponent(ids)}` : '/';

  event.waitUntil((async () => {
    const target = new URL(url, self.location.origin).href;
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      if ('focus' in client) {
        // For shopping-day acks, the URL must end up at `/?ack=<ids>` so the
        // client-side hook fires the edge function. postMessage alone is
        // unreliable on iOS PWAs (the message can be dropped while the page
        // is being foregrounded), so we navigate the client when possible.
        if (shouldAck) {
          if (typeof client.navigate === 'function') {
            try {
              const navigated = await client.navigate(target);
              return (navigated || client).focus();
            } catch {
              // navigate() can reject for cross-origin or unsupported cases —
              // fall through to the postMessage fallback below.
            }
          }
          client.postMessage({ type: 'ack-list', listIds: data.listIds });
        }
        return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  })());
});
