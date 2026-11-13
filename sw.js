/* =====================================================
   AnbuKai — Service Worker
   Version: v3

   - HTML / JS / CSS: Network first
   - Network failure: Cached fallback
   - Only this app's old caches are removed
   - Video files, streams and external APIs are not cached
   ===================================================== */

'use strict';

const CACHE_PREFIX = 'anbukai-';
const CACHE_NAME = CACHE_PREFIX + 'v3';

const APP_BASE = new URL('./', self.location.href);
const APP_PATH = APP_BASE.pathname;

const ASSETS = [
  './',
  'index.html',
  'style.css?v=12',
  'hero.css?v=12',
  'animations.css?v=12',
  'profile.css?v=12',
  'i18n.js?v=12',
  'intro.js?v=12',
  'hero.js?v=12',
  'data.js?v=12',
  'home.js?v=12',
  'videos.js?v=12',
  'auth.js?v=12',
  'anilist.js?v=12',
  'player.js?v=12',
  'animations.js?v=12',
  'nav.js?v=12',
  'manifest.json'
].map(function (path) {
  return new URL(path, APP_BASE).href;
});

/* ================= INSTALL ================= */

self.addEventListener('install', function (event) {
  event.waitUntil(
    (async function () {
      const cache = await caches.open(CACHE_NAME);

      // One unavailable file must not block installation.
      await Promise.all(
        ASSETS.map(async function (url) {
          try {
            const response = await fetch(
              new Request(url, { cache: 'reload' })
            );

            if (response.ok && response.type === 'basic') {
              await cache.put(url, response);
            }
          } catch (error) {
            console.warn('[AnbuKai SW] Precache failed:', url);
          }
        })
      );

      await self.skipWaiting();
    })()
  );
});

/* ================= ACTIVATE ================= */

self.addEventListener('activate', function (event) {
  event.waitUntil(
    (async function () {
      const names = await caches.keys();

      await Promise.all(
        names.map(function (name) {
          if (
            name.startsWith(CACHE_PREFIX) &&
            name !== CACHE_NAME
          ) {
            return caches.delete(name);
          }

          return Promise.resolve(false);
        })
      );

      await self.clients.claim();
    })()
  );
});

/* ================= REQUEST FILTER ================= */

function shouldHandle(request) {
  if (request.method !== 'GET') return false;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return false;
  if (!url.pathname.startsWith(APP_PATH)) return false;

  // Partial video requests must not be cached here.
  if (request.headers.has('range')) return false;

  if (request.mode === 'navigate') return true;

  return (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'manifest'
  );
}

/* ================= CACHE FALLBACK ================= */

async function findCachedResponse(cache, request) {
  const exact = await cache.match(request);

  if (exact) return exact;

  const url = new URL(request.url);

  // Only the app homepage gets an index.html fallback.
  if (
    request.mode === 'navigate' &&
    (
      url.pathname === APP_PATH ||
      url.pathname === APP_PATH + 'index.html'
    )
  ) {
    const indexUrl = new URL('index.html', APP_BASE).href;
    return cache.match(indexUrl);
  }

  return undefined;
}

/* ================= NETWORK FIRST ================= */

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    // Bypass the browser HTTP cache for app assets.
    const response = await fetch(request, {
      cache: 'no-store'
    });

    if (
      response.ok &&
      response.type === 'basic' &&
      response.status !== 206
    ) {
      try {
        await cache.put(request, response.clone());
      } catch (error) {
        console.warn('[AnbuKai SW] Cache write failed:', request.url);
      }
    }

    // Do not hide server errors by silently serving old code.
    return response;
  } catch (error) {
    const cached = await findCachedResponse(cache, request);

    if (cached) return cached;

    if (request.mode === 'navigate') {
      return new Response(
        '<!DOCTYPE html>' +
        '<html lang="bn">' +
        '<head>' +
        '<meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>AnbuKai — Offline</title>' +
        '</head>' +
        '<body style="background:#0b0b13;color:#eee;' +
        'font-family:system-ui;padding:32px;line-height:1.7">' +
        '<h1>ইন্টারনেট সংযোগ নেই</h1>' +
        '<p>এই পেজটির অফলাইন কপি পাওয়া যায়নি। ' +
        'ইন্টারনেট চালু করে আবার চেষ্টা করুন।</p>' +
        '<button onclick="location.reload()" ' +
        'style="padding:12px 20px;cursor:pointer">' +
        'আবার চেষ্টা করুন</button>' +
        '</body></html>',
        {
          status: 503,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store'
          }
        }
      );
    }

    return Response.error();
  }
}

/* ================= FETCH ================= */

self.addEventListener('fetch', function (event) {
  if (!shouldHandle(event.request)) return;

  event.respondWith(networkFirst(event.request));
});

/* ================= OPTIONAL UPDATE MESSAGE ================= */

self.addEventListener('message', function (event) {
  if (
    event.data &&
    event.data.type === 'SKIP_WAITING'
  ) {
    event.waitUntil(self.skipWaiting());
  }
});
