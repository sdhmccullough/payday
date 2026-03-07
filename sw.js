// Service Worker — network-first for updates, cache for offline
const CACHE_NAME = 'nannypay-v8';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './firebase-config.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Install — cache all assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network-first for app files, skip Firebase/Google API requests
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Don't cache Firebase or Google API requests
  if (url.hostname.includes('googleapis.com') ||
      url.hostname.includes('gstatic.com') ||
      url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('firebaseapp.com') ||
      url.hostname.includes('google.com')) {
    return;
  }

  // Network-first for app files (so updates deploy immediately)
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache a copy of the fresh response
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => {
        // Offline — fall back to cache
        return caches.match(event.request);
      })
  );
});
