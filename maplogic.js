/* Pure geo helpers for the map page.

   Distances are computed properly rather than by comparing raw degrees: a
   fixed degree threshold is several hundred metres at the equator but only
   tens near the poles, and it treats the two sides of the date line as half
   a world apart. Both cases decide whether a pin counts as a duplicate. */

const EARTH_R = 6371000;

/* metres between two coordinates (equirectangular approximation — exact
   enough far below the scale where two pins mean the same place) */
function distanceM(lat1, lon1, lat2, lon2){
  const rad = Math.PI / 180;
  /* shortest way round, so 179.9°E and 179.9°W are neighbours */
  let dLon = ((lon2 - lon1 + 540) % 360) - 180;
  const x = dLon * rad * Math.cos((lat1 + lat2) / 2 * rad);
  const y = (lat2 - lat1) * rad;
  return Math.sqrt(x * x + y * y) * EARTH_R;
}

/* the first saved location within `metres` of the point, or null */
function findNearby(locations, lat, lon, metres){
  if(!locations || !locations.length) return null;
  const lim = metres === undefined ? 11 : metres;
  for(let i = 0; i < locations.length; i++){
    const l = locations[i];
    if(!l || !Number.isFinite(+l.lat) || !Number.isFinite(+l.lon)) continue;
    if(distanceM(+l.lat, +l.lon, +lat, +lon) <= lim) return l;
  }
  return null;
}

/* Reading the phone's position.

   A single getCurrentPosition() returns the first fix the phone has, and
   that is usually a Wi-Fi or cell-tower estimate taken before the GPS has
   locked on: off by hundreds of metres, sometimes kilometres. The fix
   improves over the next few seconds, so the position is watched and the
   most accurate fix kept, until it is good enough or time runs out.

   FIX_GOAL_M   — good enough to stop: a typical open-sky phone GPS fix
   FIX_MAX_MS   — the longest the user waits; the best fix so far is used
   FIX_COARSE_M — worse than this, the user is told why (indoors, or the
                  phone's "precise location" switched off) */
const FIX_GOAL_M = 20, FIX_MAX_MS = 15000, FIX_COARSE_M = 100;

/* a reading in usable shape, or null */
function asFix(pos){
  const c = pos && pos.coords;
  if(!c) return null;
  const lat = +c.latitude, lon = +c.longitude, acc = +c.accuracy;
  if(!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return {lat, lon, acc:Number.isFinite(acc) && acc >= 0 ? acc : Infinity};
}

/* the better of two fixes: the smaller error circle. A tie keeps the newer
   one, which is the more current position. */
function betterFix(best, next){
  if(!next) return best || null;
  if(!best) return next;
  return next.acc <= best.acc ? next : best;
}

const fixDone = fix => !!fix && fix.acc <= FIX_GOAL_M;
const fixCoarse = fix => !!fix && fix.acc > FIX_COARSE_M;

if(typeof module !== 'undefined') module.exports = {findNearby, distanceM, asFix, betterFix, fixDone, fixCoarse, FIX_GOAL_M, FIX_MAX_MS, FIX_COARSE_M};
