const CACHE_NAME = 'anbukai-v1';
const ASSETS = [
  '/AnbuKai-Anime-Dark-Gold/',
  '/AnbuKai-Anime-Dark-Gold/index.html',
  '/AnbuKai-Anime-Dark-Gold/style.css',
  '/AnbuKai-Anime-Dark-Gold/hero.css',
  '/AnbuKai-Anime-Dark-Gold/animations.css'
];

// ফাইলগুলো ক্যাশ মেমোরিতে সেভ করা
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// ইন্টারনেট ছাড়াই ক্যাশ থেকে ফাইল লোড করা
self.addEventListener('fetch', (e) => {
  // শুধুমাত্র নিজের সাইটের ফাইল ক্যাশ করবে, API রিকোয়েস্ট বাদ দেবে
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
