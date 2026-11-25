'use strict';

const CACHE_NAME = 'rustling-leaves-v2';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/styles.css',
  './scripts/script.js',
  './manifest.json',
  './audio/ui-click-start.mp3',
  './audio/ui-click-end.mp3',
  './ico/favicon.ico',
  './ico/icon_x48.png',
  './ico/icon_x72.png',
  './ico/icon_x96.png',
  './ico/icon_x128.png',
  './ico/icon_x192.png',
  './ico/icon_x384.png',
  './ico/icon_x512.png',
  './ico/icon_x1024.png',
  './pictures/1.svg',
  './pictures/2.svg',
  './pictures/3.svg',
  './pictures/4.svg',
  './pictures/5.svg',
  './pictures/6.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function buildRangeResponse(request, cachedResponse) {
  const rangeHeader = request.headers.get('range');
  if (!rangeHeader) {
    return cachedResponse;
  }

  const arrayBuffer = await cachedResponse.arrayBuffer();
  const totalLength = arrayBuffer.byteLength;
  const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);

  if (!match) {
    return new Response(arrayBuffer, {
      status: 200,
      headers: cachedResponse.headers,
    });
  }

  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), totalLength - 1) : totalLength - 1;

  if (start >= totalLength || start > end) {
    return new Response(null, {
      status: 416,
      headers: {
        'Content-Range': `bytes */${totalLength}`,
      },
    });
  }

  const slicedBuffer = arrayBuffer.slice(start, end + 1);
  const headers = new Headers(cachedResponse.headers);
  headers.set('Content-Range', `bytes ${start}-${end}/${totalLength}`);
  headers.set('Content-Length', String(slicedBuffer.byteLength));
  headers.set('Accept-Ranges', 'bytes');

  return new Response(slicedBuffer, {
    status: 206,
    statusText: 'Partial Content',
    headers,
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      caches
        .match('./index.html', { ignoreSearch: true })
        .then((cachedPage) => cachedPage || fetch(request))
        .catch(() => caches.match('./', { ignoreSearch: true }))
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request, { ignoreSearch: true });

      if (cached) {
        if (request.headers.has('range')) {
          return buildRangeResponse(request, cached.clone());
        }
        return cached;
      }

      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.ok && networkResponse.status === 200) {
          cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      } catch (_err) {
        const fallback = await cache.match('./index.html', { ignoreSearch: true });
        return fallback || Response.error();
      }
    })()
  );
});
