/* Which caching rule a request falls under.

   Split out of sw.js so it can be unit tested: a service worker cannot be
   registered in the development browser here, so the routing decision — the
   part where a mistake would silently serve stale code or cache a forecast —
   is the part that gets pinned by tests. */

/* forecasts go stale by the minute and tiles would fill the device */
const NEVER_HOSTS = [
  'open-meteo.com',
  'basemaps.cartocdn.com',
  'arcgisonline.com',
  'workers.dev'
];

/* version-pinned, so it cannot change under us */
const IMMUTABLE = /^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\//;

function cacheStrategy(urlString, selfOrigin){
  let u;
  try{ u = new URL(urlString); }catch(e){ return 'never'; }
  if(NEVER_HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h))) return 'never';
  if(IMMUTABLE.test(urlString)) return 'immutable';
  if(u.origin === selfOrigin) return 'fresh';
  return 'never';
}

/* The cache key for one of our own files: the URL without its query. Scripts
   are requested as app.js?r=<index.html's revision>; keyed by the full URL,
   every deploy would add another copy of every file, and an offline start
   could only find the copy for exactly its own revision. */
function cacheKey(urlString){
  const u = new URL(urlString);
  u.search = '';
  return u.href;
}

if(typeof module !== 'undefined') module.exports = {cacheStrategy, cacheKey};
