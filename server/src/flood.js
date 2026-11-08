/* Flood alerts from JPS river-level stations.

   JPS (Jabatan Pengairan dan Saliran) publishes every telemetry station's
   latest reading as the JSON behind the map on publicinfobanjir.water.gov.my:
   position, water level, the level band JPS itself assigns (Normal, Alert,
   Warning, Danger), the threshold crossed and the reading time. data.gov.my
   has a flood-warning dataset too, but it stopped updating in February 2024.

   A plot is alerted when a station within FLOOD_KM is at Warning or Danger.
   Alert alone is left out: it means "risen well above normal", which in the
   monsoon is most days somewhere.

   Readings are filtered, because the feed carries faults as well as floods:
     - a station whose threshold is 0 has no threshold set, and JPS marks it
       Danger whatever the level (a dozen Sabah stations, November 2026);
     - a reading older than FRESH_MIN is from a station that has gone quiet. */

const FLOOD_URL = 'https://publicinfobanjir.water.gov.my/wp-content/themes/enlighten/data/latestreadingstrendabc.json';
const FLOOD_KM = 10;
const FRESH_MIN = 120;
const RANK = {Warning:1, Danger:2};

const num = v => { const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? n : null; };

/* 'dd/mm/yyyy HH:MM' → 'yyyy-mm-ddTHH:MM' */
function isoOf(s){
  const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(String(s || '').trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}` : null;
}

/* minutes from a to b, both 'yyyy-mm-ddTHH:MM' in the same zone */
const minutesBetween = (a, b) => (Date.parse(b + ':00Z') - Date.parse(a + ':00Z')) / 60000;

/* The stations at Warning or Danger right now, at `nowMyt`
   ('yyyy-mm-ddTHH:MM', Malaysian time). */
function floodStations(list, nowMyt){
  if(!Array.isArray(list)) return [];
  const out = [];
  for(const x of list){
    if(!x || typeof x !== 'object' || !/WL/.test(String(x.i || ''))) continue;
    const rank = RANK[x.n];
    if(!rank) continue;
    const lat = num(x.c), lon = num(x.d), level = num(x.m), thr = num(x.o);
    if(lat === null || lon === null || level === null || thr === null || thr <= 0) continue;
    const time = isoOf(x.q);
    if(!time) continue;
    const age = minutesBetween(time, nowMyt);
    if(!(age >= -15 && age <= FRESH_MIN)) continue;
    out.push({id:String(x.a || x.ff || x.b), name:String(x.b || '').slice(0, 80), district:String(x.e || '').slice(0, 40),
              lat, lon, level, thr, severity:x.n, rank, time, trend:String(x.s || '')});
  }
  return out;
}

function km(lat1, lon1, lat2, lon2){
  const r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

/* Stations within FLOOD_KM of a plot, worst first, then nearest. */
function floodNear(stations, lat, lon){
  return stations
    .map(s => Object.assign({km:km(lat, lon, s.lat, s.lon)}, s))
    .filter(s => s.km <= FLOOD_KM)
    .sort((a, b) => b.rank - a.rank || a.km - b.km);
}

export {FLOOD_URL, FLOOD_KM, FRESH_MIN, RANK, isoOf, floodStations, floodNear, km};
