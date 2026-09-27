// オフラインでも遊べるよう、全素材をキャッシュする
const CACHE = 'bunpuku-v2';
const ASSETS = [
  './', 'index.html', 'app.js', 'manifest.webmanifest',
  'img/scratch.jpg', 'img/brush.png', 'img/about.jpg',
  'img/icon-180.png', 'img/icon-192.png', 'img/icon-512.png',
  'sound/coin.m4a', 'sound/scratch.m4a',
  ...Array.from({ length: 20 }, (_, i) => `img/contents${String(i + 1).padStart(3, '0')}.jpg`),
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
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
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
