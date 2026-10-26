'use strict';
// Sadece uygulama kabuğunu önbelleğe alır. Oyun verisi canlı bağlantıdan gelir, önbelleğe girmez.
const CACHE = 'wordchain-v4';
const SHELL = ['/style.css', '/app.js', '/sound.js', '/challenge.js', '/icons/icon-192.png', '/fonts/montserrat-latin-wght-normal.woff2', '/fonts/montserrat-latin-ext-wght-normal.woff2'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin || u.pathname.startsWith('/downloads/') || u.pathname === '/app-info.json' || u.pathname === '/healthz') return;
  // Önce ağ, olmazsa önbellek (güncellemeler hemen gelsin)
  e.respondWith(
    fetch(r).then((res) => {
      if (res.ok && (SHELL.includes(u.pathname) || u.pathname.startsWith('/avatars/') || u.pathname.startsWith('/icons/'))) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(r, copy));
      }
      return res;
    }).catch(() => caches.match(r).then((hit) => hit || (r.mode === 'navigate' ? caches.match('/') : Response.error())))
  );
});
