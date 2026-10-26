// LYNKO CHAT service worker — app shell + last-seen chats work offline.
// Cached API data is the same ENCRYPTED data the server sends; it is wiped on logout.
const SHELL = 'lynko-shell-v10', API = 'lynko-api-v2', EXT = 'lynko-ext-v2';
const PRE = ['/', '/chat', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];
const READ = /^\/api\/(me|config|chats|messages|statuses|official|dp\/|banner\/|blob\/|status\/)/;
const IMMUTABLE = /^\/api\/(blob\/|dp\/|banner\/|status\/[^/]+\/blob)/;   // media never changes -> cache first

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => Promise.all(PRE.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => ![SHELL, API, EXT, 'lynko-lock'].includes(k)).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const withTimeout = (req, ms) => { const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  return fetch(req, { signal: c.signal }).finally(() => clearTimeout(t)); };

async function trim(cache, max) {
  const ks = await cache.keys(); for (let i = 0; i < ks.length - max; i++) await cache.delete(ks[i]);
}

// new messages fetched with &after= get merged into the saved full chat list
async function mergeMessages(url, res) {
  try {
    if (!url.searchParams.has('after')) return;
    const w = url.searchParams.get('with'), cache = await caches.open(API);
    const key = new Request(url.origin + '/api/messages?with=' + w);
    const old = await cache.match(key); const add = await res.clone().json();
    if (!old || !add.length) return;
    const list = await old.json(), ids = new Set(list.map(m => m.id));
    add.forEach(m => { if (!ids.has(m.id)) list.push(m); });
    await cache.put(key, new Response(JSON.stringify(list.slice(-300)), { headers: { 'Content-Type': 'application/json' } }));
  } catch {}
}

async function apiRead(req, url) {
  const cache = await caches.open(API);
  if (IMMUTABLE.test(url.pathname)) {
    const hit = await cache.match(req); if (hit) return hit;
    const res = await fetch(req);
    if (res.status === 200) { cache.put(req, res.clone()); trim(cache, 400); }
    return res;
  }
  try {
    const res = await withTimeout(req, 5000);
    if (res.status === 200) {
      if (url.pathname === '/api/messages') await mergeMessages(url, res);
      if (!url.searchParams.has('after')) cache.put(req, res.clone());
    }
    return res;
  } catch (err) {
    const hit = await cache.match(req); if (hit) return hit;
    if (url.pathname === '/api/messages' && url.searchParams.has('after'))   // offline poll -> nothing new
      return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
    throw err;
  }
}

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;

  if (url.origin !== location.origin) {                      // fonts, pusher script: stale-while-revalidate
    if (!/fonts\.(googleapis|gstatic)\.com|js\.pusher\.com/.test(url.hostname)) return;
    e.respondWith(caches.open(EXT).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.pathname === '/health' || url.pathname.startsWith('/admin') || url.pathname.endsWith('.apk')) return;   // never cache admin / the APK
  if (url.pathname.startsWith('/api/')) {
    if (READ.test(url.pathname)) e.respondWith(apiRead(req, url));
    return;
  }
  // pages & static files: network first, saved copy when offline
  e.respondWith(fetch(req, { cache: 'no-cache' }).then(res => {   // always revalidate: an old copy in the browser cache can never hide a new deploy
    if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(req, copy)); }
    return res;
  }).catch(async () => (await caches.match(req)) || (req.mode === 'navigate' ? await caches.match('/chat') : Response.error())));
});

// ── push alerts (messages are end-to-end encrypted, so alerts only say WHO wrote, never WHAT) ──
self.addEventListener('push', e => {
  let d = {}; try { d = e.data.json() } catch {}
  e.waitUntil((async () => {
    if (d.type === 'missed') (await self.registration.getNotifications({ tag: 'call' })).forEach(n => n.close());
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const seen = wins.some(w => w.visibilityState === 'visible');
    try { const r = await (await caches.open('lynko-lock')).match('/__locked');   // locked chats: no name, no hint
      if (r && d.type === 'msg' && (await r.json()).includes(d.from)) d = { ...d, title: 'LYNKO CHAT', body: 'You have a new message', tag: 'lk', from: null }; } catch {}
    const url = d.type === 'call' ? '/chat?call=1' : d.from ? '/chat?c=' + d.from : '/chat';
    await self.registration.showNotification(d.title || 'LYNKO CHAT', {
      body: d.body || 'New message', tag: d.tag || 'lynko', renotify: true, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
      vibrate: d.type === 'call' ? [400, 200, 400, 200, 400] : [200, 100, 200], requireInteraction: d.type === 'call', data: { url, from: d.from, call: d.type === 'call' },
    });
    if (seen && d.type !== 'call') setTimeout(async () => (await self.registration.getNotifications({ tag: d.tag })).forEach(n => n.close()), 1500);   // app is open: the in-app banner already showed it
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const d = e.notification.data || {};
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const w = wins.find(x => x.url.includes('/chat')) || wins[0];
    if (w) { await w.focus(); w.postMessage({ type: 'open', c: d.from, call: !!d.call }); return; }
    await self.clients.openWindow(d.url || '/chat');
  })());
});
