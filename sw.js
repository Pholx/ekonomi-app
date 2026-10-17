// ════════════════════════════════════════════════════════════════════
// SERVICE WORKER – Ekonomi (Budget + FIRE)
// ════════════════════════════════════════════════════════════════════
// Bumpa CACHE_NAME när du uppdaterar någon fil.
// ════════════════════════════════════════════════════════════════════

const CACHE_NAME = 'ekonomi-v31';

const ASSETS_TO_CACHE = [
  './',
  './budget/budget.html',
  './budget/data.js',
  './budget/calculator.js',
  './budget/storage.js',
  './budget/render.js',
  './budget/summary.js',
  './fire/fire.html',
  './fire/assets_data.js',
  './fire/assets_manager.js',
  './fire/fire_calculator.js',
  './fire/fire_storage.js',
  './fire/fire_accounts.js',
  './fire/motivation.js',
  './fire/tabs.js',
  './fire/bridge.js',
  './fire/custom_goal.js',
  './fire/compare.js',
  './fire/compare_housing.js',
  './fire/compare_networth.js',
  './shared/style.css',
  './shared/viewbar.js',
  './shared/ageCurve.js',
  './manifest.json',
  './icon/icon-192.png',
  './icon/icon-512.png',
  './icon/icon-192-maskable.png',
  './icon/icon-512-maskable.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        if (event.request.mode === 'navigate') {
  return caches.match('./budget/budget.html');
}
      });
    })
  );
});