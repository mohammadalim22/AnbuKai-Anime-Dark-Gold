/* =====================================================
   sw.js  (Network-First)
   - নতুন ফাইল সবসময় আগে নেট থেকে আনবে (পুরনো cache আটকে থাকবে না)
   - নেট না থাকলে cache থেকে চালাবে
   ===================================================== */

// প্রতিবার বড় পরিবর্তন করলে এই নাম্বার বাড়ান (v3 -> v4 ...)
const CACHE_NAME = 'anbukai-v3';

// Relative path, তাই GitHub Pages এর যেকোনো folder এ কাজ করবে
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './hero.css',
  './animations.css',
  './profile.css',
  './player.js',
  './data.js',
  './videos.js'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // একটা ফাইল না পেলেও install আটকাবে না
      Promise.all(ASSETS.map((url) => cache.add(url).catch(() => {})))
    )
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.map((name) => (name !== CACHE_NAME ? caches.delete(name) : null)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;

  // Network first: আগে নেট, ব্যর্থ হলে cache
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((response) => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return response;
      })
      .catch(() => caches.match(req))
  );
});