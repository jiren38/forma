// Service worker: cache dell'app shell per l'uso offline (network-first per l'HTML, cache-first per gli asset).
const CACHE = 'forma-v2';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase e API esterne: sempre rete
  if (url.pathname.endsWith('/version.json')) return; // sempre dalla rete
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req, { cache: 'no-store' }).then((r) => { const c = r.clone(); caches.open(CACHE).then((ca) => ca.put(req, c)); return r; }).catch(() => caches.match(req).then((r) => r || caches.match('./'))));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((ca) => ca.put(req, c)); } return r; })));
});
self.addEventListener('notificationclick', (e) => { e.notification.close(); e.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) => cs[0] ? cs[0].focus() : self.clients.openWindow('./'))); });
