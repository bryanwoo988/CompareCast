/* 天气预测 · service worker
   Shell is cached so the app opens offline.
   Weather data is NEVER cached — forecasts must always be fresh. */
const VERSION = 'pw-v3.12.0';
const SHELL = VERSION + '-shell';
const SHELL_FILES = [
  './', './index.html', './swpolicy.js', './daylogic.js', './maplogic.js', './listlogic.js', './notifylogic.js', './app.js', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
];
/* Unguarded, a failed import takes the whole worker down — and with it
   offline support AND push notifications, silently. The policy file is in the
   shell so this only bites on a cold install over a bad connection; falling
   back to not intercepting keeps the app working online-only until the next
   launch repairs the worker. */
try{ importScripts('./swpolicy.js'); }catch(e){}
const strategyFor = (typeof cacheStrategy === 'function') ? cacheStrategy : (() => 'never');

/* How long to wait for the network before falling back to cache. Long enough
   for a slow mobile connection to win, short enough that a dead one does not
   leave the user staring at nothing. */
const NET_TIMEOUT_MS = 2500;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    // add one by one so a single CDN failure does not abort the install
    await Promise.all(SHELL_FILES.map(u => c.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;
  const how = strategyFor(req.url, self.location.origin);
  if(how === 'never') return;

  if(how === 'immutable'){
    /* version-pinned third party: cache wins, refreshed quietly behind it */
    e.respondWith((async () => {
      const cached = await caches.match(req);
      const net = fetch(req).then(res => {
        if(res && (res.ok || res.type === 'opaque'))
          caches.open(SHELL).then(c => c.put(req, res.clone())).catch(() => {});
        return res;
      }).catch(() => null);
      if(cached) return cached;
      return (await net) || new Response('Offline', {status:503});
    })());
    return;
  }

  /* our own files: network first.

     This used to be cache-first, which meant an update needed two launches —
     the first quietly refreshed the cache and the second finally showed it.
     People opened the app once, saw nothing new, and stayed on an old build
     for weeks. Now the first launch gets the new code, and the cache is the
     fallback rather than the default. */
  e.respondWith((async () => {
    const cached = await caches.match(req);
    let timer;
    const timeout = new Promise(r => { timer = setTimeout(() => r(null), NET_TIMEOUT_MS); });
    const net = fetch(req).then(res => {
      if(res && res.ok) caches.open(SHELL).then(c => c.put(req, res.clone())).catch(() => {});
      return res && res.ok ? res : null;
    }).catch(() => null);

    const fresh = await Promise.race([net, timeout]);
    clearTimeout(timer);
    if(fresh) return fresh;
    if(cached) return cached;
    /* nothing cached and nothing on the wire: let a slow network finish
       rather than failing at the timeout */
    const late = await net;
    if(late) return late;
    if(req.mode === 'navigate'){
      const fallback = await caches.match('./index.html');
      if(fallback) return fallback;
    }
    return new Response('Offline', {status:503, statusText:'Offline'});
  })());
});

/* ---- push ----
   The worker sends {title, body}; anything unparseable still shows something
   rather than nothing, because a push event that resolves without showing a
   notification makes the browser display its own "site updated in background"
   message, which is worse than a vague one of ours. */
self.addEventListener('push', e => {
  let d = {};
  try{ d = e.data ? e.data.json() : {}; }catch(err){ d = {}; }
  const title = d.title || 'CompareCast';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || '',
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: d.tag || 'pw-reminder',
    renotify: false,
    data: {url: './'}
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({type:'window', includeUncontrolled:true});
    for(const c of all){ if('focus' in c) return c.focus(); }
    if(self.clients.openWindow) return self.clients.openWindow('./');
  })());
});
