/* 天气预测 · service worker
   Shell is cached so the app opens offline.
   Weather data is NEVER cached — forecasts must always be fresh. */
const VERSION = 'pw-v3.6.0';
const SHELL = VERSION + '-shell';
const SHELL_FILES = [
  './', './index.html', './daylogic.js', './maplogic.js', './listlogic.js', './notifylogic.js', './app.js', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
];
/* Live data and map tiles are never stored: forecasts must always be fresh,
   and tiles would fill the device. Matched with hostname.endsWith(). */
const NEVER_CACHE = [
  'open-meteo.com',          // forecast, geocoding and ERA5 archive
  'basemaps.cartocdn.com',   // street + dark tiles
  'arcgisonline.com'         // satellite imagery + label tiles
];

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
  let url;
  try { url = new URL(req.url); } catch(err) { return; }

  // live data + map tiles: network only, never stored
  if(NEVER_CACHE.some(h => url.hostname.endsWith(h))) return;

  // app shell: cache first, refresh in the background
  e.respondWith((async () => {
    const cached = await caches.match(req, {ignoreSearch:false});
    const net = fetch(req).then(res => {
      if(res && (res.ok || res.type === 'opaque')){
        caches.open(SHELL).then(c => c.put(req, res.clone())).catch(() => {});
      }
      return res;
    }).catch(() => null);
    if(cached) { net; return cached; }
    const res = await net;
    if(res) return res;
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
