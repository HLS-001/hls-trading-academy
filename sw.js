/*
 * The service worker: makes the app work offline.
 *
 * - The cache name carries the build version (precache.js changes whenever any file does), so an
 *   update is a new cache and old ones are deleted.
 * - A new version WAITS. The page shows "An update is ready", and only then does it take over. That
 *   avoids the stale-copy trap of a cache-first worker that silently keeps serving old files.
 * - Network first for the lesson bundle and the page, so a refresh picks up new lessons; cache first for
 *   everything else.
 */

importScripts('./precache.js');
const { version, files } = self.HLS_PRECACHE;
const CACHE = 'hls-academy-' + version;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(files)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('hls-academy-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  const networkFirst = url.pathname.endsWith('/content/bundle.json') || req.mode === 'navigate';
  if (networkFirst) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html') || caches.match('./')))
    );
    return;
  }
  event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
