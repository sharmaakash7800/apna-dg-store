/* APNA DG STORE - PWA SERVICE WORKER FOR BOTH ADMIN & CUSTOMER STORE APPS */
const CACHE_NAME = 'apna-dg-store-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
