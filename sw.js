importScripts('./offline-assets.js');

const PREFIX = 'hobbyorbit-shell-';
const CACHE = PREFIX + self.ORBIT_SHELL.version;
const STYLES = [
  'https://cdn.neorgon.org/v1.0.0/styles/base.css',
  'https://cdn.neorgon.org/v1.0.0/header/season.css',
];
const localAssets = new Set(self.ORBIT_SHELL.files.map(file => new URL(file, self.location.href).href));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      await cache.addAll(self.ORBIT_SHELL.files.map(url => new Request(url, {cache: 'reload'})));
      // Fleet styles stay canonical on the CDN. Opaque CSS responses can be
      // cached with put(), and used by the stylesheet's same no-cors request.
      for (const url of STYLES) {
        const request = new Request(url, {mode: 'no-cors', cache: 'reload'});
        const response = await fetch(request);
        if (!response.ok && response.type !== 'opaque') throw new Error('Style unavailable');
        await cache.put(request, response);
      }
    } catch (error) {
      await caches.delete(CACHE);
      throw error;
    }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'APPLY_UPDATE') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const navigation = event.request.mode === 'navigate' && url.origin === self.location.origin;
  if (!navigation && !localAssets.has(url.href) && !STYLES.includes(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = navigation ? new URL('./index.html', self.location.href).href : event.request;
    const cached = await cache.match(key);
    return cached || fetch(event.request);
  })());
});
