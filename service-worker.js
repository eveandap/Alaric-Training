const CACHE_NAME = 'ap-baseball-sync-repair-v13';

const ESSENTIAL_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './firebase-config.js',
  './firebase-config.js?v=20260718-sync13',
  './firebase-sync.js',
  './firebase-sync.js?v=20260718-sync13'
];

const OPTIONAL_ASSETS = [
  './icons/favicon.ico',
  './icons/favicon-16.png',
  './icons/favicon-32.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './badges/brick-wall.png',
  './badges/bucket-boss.svg',
  './badges/iron-glove.svg',
  './badges/barrel-machine.svg',
  './badges/quick-hands.svg',
  './badges/first-step.svg',
  './badges/lightning-legs.svg',
  './badges/rubber-legs.svg',
  './badges/forearm-forge.svg',
  './badges/gap-to-gap.svg',
  './badges/launch-sequence.svg',
  './badges/finish-better.svg',
  './badges/five-tool-club.svg',
  './badges/seven-day-streak.svg',
  './badges/thirty-day-streak.svg',
  './badges/hundred-workouts.svg',
  './badges/elite-performer.svg',
  './ap_adaptive_performance_coin_selected_v9_technical.glb'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ESSENTIAL_SHELL);

    // Missing optional artwork must never prevent a new app version from installing.
    await Promise.allSettled(OPTIONAL_ASSETS.map(async path => {
      const response = await fetch(path, { cache: 'reload' });
      if(response.ok) await cache.put(path, response);
    }));

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function networkFirst(request){
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if(response && response.ok) await cache.put(request, response.clone());
    return response;
  } catch(error) {
    const cached = await cache.match(request, { ignoreSearch:true });
    if(cached) return cached;
    if(request.mode === 'navigate') return cache.match('./index.html');
    throw error;
  }
}

async function cacheFirst(request){
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch:false });
  if(cached) return cached;

  const response = await fetch(request);
  if(response && response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if(request.method !== 'GET') return;

  const url = new URL(request.url);
  if(url.origin !== self.location.origin) return;

  const isFreshCode = request.mode === 'navigate' ||
    request.destination === 'document' ||
    request.destination === 'script' ||
    url.pathname.endsWith('/firebase-config.js') ||
    url.pathname.endsWith('/firebase-sync.js') ||
    url.pathname.endsWith('/manifest.json');

  event.respondWith(isFreshCode ? networkFirst(request) : cacheFirst(request));
});
