const CACHE_NAME = 'anbukai-v2'; // v1 থেকে v2 করা হলো যাতে ক্যাশ ক্লিয়ার হয়
const ASSETS = [
  '/AnbuKai-Anime-Dark-Gold/',
  '/AnbuKai-Anime-Dark-Gold/index.html',
  '/AnbuKai-Anime-Dark-Gold/style.css',
  '/AnbuKai-Anime-Dark-Gold/hero.css',
  '/AnbuKai-Anime-Dark-Gold/animations.css',
  '/AnbuKai-Anime-Dark-Gold/player.js', // player.js যুক্ত করা হলো
  '/AnbuKai-Anime-Dark-Gold/data.js'    // data.js যুক্ত করা হলো
];

// ফাইলগুলো ক্যাশ মেমোরিতে সেভ করা
self.addEventListener('install', (e) => {
  self.skipWaiting(); // নতুন সার্ভিস ওয়ার্কার সাথে সাথে অ্যাক্টিভ হবে
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// পুরোনো ক্যাশ ডিলিট করা (এটি খুবই জরুরি)
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// ইন্টারনেট ছাড়াই ক্যাশ থেকে ফাইল লোড করা
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(e.request).then((response) => {
        return caches.open(CACHE_NAME).then((cache) => {
          if (response.status === 200) {
            cache.put(e.request, response.clone());
          }
          return response;
        });
      });
    })
  );
});