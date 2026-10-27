const CACHE = 'ripasso-v7';
const ASSETS = [
  './', 'index.html', 'styles.css', 'app.js', 'data.json',
  'manifest.webmanifest', 'icon-192.png', 'icon-512.png'
];

self.addEventListener('install', (e) => {
  // 'reload' skips the browser's HTTP cache, so an update never re-caches the previous version's files
  const fresh = ASSETS.map((u) => new Request(u, { cache: 'reload' }));
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(fresh)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => hit))
  );
});
