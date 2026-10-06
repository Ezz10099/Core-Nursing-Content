'use strict';

const CACHE_PREFIX = 'core-nursing-web-';
const CACHE_NAME = CACHE_PREFIX + 'v1';
const SHELL = ['./','./index.html','./boot.js','./browser-platform.js','./manifest.webmanifest','./icon.svg'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function canonicalKey(request) {
  const url = new URL(request.url);
  url.search = '';
  url.hash = '';
  return url.toString();
}

function isRuntimeObject(url) { return url.pathname.includes('/runtime/objects/'); }
function isUpdateAsset(url) {
  return url.pathname.endsWith('/runtime/runtime-manifest.json') ||
    url.pathname.endsWith('/runtime/runtime-manifest.sig') ||
    url.pathname.endsWith('/content.json') ||
    url.pathname.endsWith('/content.sig');
}
function isWebShell(url) {
  return url.pathname.includes('/web/') && (
    url.pathname.endsWith('/web/') ||
    url.pathname.endsWith('/web/index.html') ||
    url.pathname.endsWith('/web/boot.js') ||
    url.pathname.endsWith('/web/browser-platform.js') ||
    url.pathname.endsWith('/web/manifest.webmanifest') ||
    url.pathname.endsWith('/web/icon.svg')
  );
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const key = canonicalKey(request);
  const cached = await cache.match(key);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(key, response.clone());
  return response;
}

async function networkFirst(request, fallbackKey) {
  const cache = await caches.open(CACHE_NAME);
  const key = canonicalKey(request);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(key, response.clone());
    return response;
  } catch (error) {
    return (await cache.match(key)) || (fallbackKey ? await cache.match(fallbackKey) : undefined) || Promise.reject(error);
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, new URL('./index.html', self.location.href).toString()));
    return;
  }
  if (isRuntimeObject(url)) { event.respondWith(cacheFirst(request)); return; }
  if (isUpdateAsset(url) || isWebShell(url)) event.respondWith(networkFirst(request));
});
