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

if(typeof module !== 'undefined') module.exports = {findNearby, distanceM};
