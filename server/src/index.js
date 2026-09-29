/* CompareCast push worker.

   Two jobs: hold each device's subscription and reminder settings, and every
   quarter hour send the reminders that have come due. Request bodies carry the
   user's plot coordinates, so nothing here logs them. */
import {validateSub} from './validate.js';
import {dueWindows, spanDays, windowSlice, aggregate, breaches} from '../../notifylogic.js';
import {messageFor} from './message.js';
import {sentKey, sendOne} from './send.js';

const cors = env => ({
  'Access-Control-Allow-Origin': env.ORIGIN,
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
});

const reply = (env, status, body) =>
  new Response(body === undefined ? null : JSON.stringify(body),
    {status, headers:Object.assign({'Content-Type':'application/json'}, cors(env))});

export default {
  async fetch(request, env){
    const origin = request.headers.get('Origin');
    /* same-origin tools and curl send no Origin; a browser from anywhere else
       is refused outright rather than relying on the browser to enforce it */
    if(origin && origin !== env.ORIGIN) return new Response('forbidden', {status:403});

    if(request.method === 'OPTIONS') return new Response(null, {status:204, headers:cors(env)});

    const url = new URL(request.url);
    if(url.pathname !== '/sub') return reply(env, 404, {error:'not found'});

    let body;
    try{ body = await request.json(); }
    catch(e){ return reply(env, 400, {error:'json'}); }

    if(request.method === 'DELETE'){
      if(!body || typeof body.id !== 'string') return reply(env, 400, {error:'id'});
      await env.KV.delete('dev:' + body.id);
      return reply(env, 204);
    }

    if(request.method === 'POST'){
      const r = validateSub(body);
      /* the error names a field, never echoes its value */
      if(!r.ok) return reply(env, 400, {error:r.error});
      await env.KV.put('dev:' + r.value.id, JSON.stringify(r.value));
      return reply(env, 204);
    }

    return reply(env, 405, {error:'method'});
  },
  scheduled(event, env, ctx){ return scheduled(event, env, ctx); }
};

const CRON_SPAN_MIN = 15;
const API = 'https://api.open-meteo.com/v1/forecast';

/* the device's own wall clock, from its IANA zone — never a hand-rolled
   UTC offset, which would be wrong twice a year */
function localNow(tz, now){
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone:tz, hour12:false,
    year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'
  }).formatToParts(now).reduce((o, x) => (o[x.type] = x.value, o), {});
  const hour = p.hour === '24' ? '00' : p.hour;
  return {day:`${p.year}-${p.month}-${p.day}`, min:(+hour) * 60 + (+p.minute)};
}

/* one request per coordinate per run, however many devices or windows want it */
async function forecast(cache, lat, lon, tz){
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  if(cache.has(key)) return cache.get(key);
  const q = new URLSearchParams({
    latitude:String(lat), longitude:String(lon), timezone:tz, forecast_days:'3',
    hourly:'temperature_2m,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m'
  });
  const p = fetch(API + '?' + q).then(r => r.ok ? r.json() : null).catch(() => null);
  cache.set(key, p);
  return p;
}

async function runDevice(env, dev, now, cache, seen){
  const {day, min} = localNow(dev.tz, now);
  const due = dueWindows(dev.notify.windows, min, CRON_SPAN_MIN);
  if(!due.length) return;

  for(const win of due){
    const blocks = dev.blocks.filter(b => b.windows.includes(win.id));
    for(const b of blocks){
      const key = sentKey(dev.id, b.id, win.id, day);
      if(seen.has(key) || await env.KV.get(key)) continue;

      const fc = await forecast(cache, b.lat, b.lon, dev.tz);
      if(!fc || !fc.hourly || !fc.hourly.time) continue;

      /* a wrapping window runs into tomorrow, so both days are sliced and the
         indices merged before anything is aggregated */
      const idx = [];
      for(const d of spanDays(win, day)){
        const {start, n} = windowSlice(fc.hourly.time, d, win);
        for(let i = 0; i < n; i++) idx.push(start + i);
      }
      if(!idx.length) continue;

      const stats = aggregate(fc.hourly, idx);
      const hits = win.mode === 'threshold' ? breaches(dev.notify.rules, stats) : [];
      if(win.mode === 'threshold' && !hits.length) continue;

      const msg = messageFor(dev.lang, win, stats, hits, dev.notify.rules, dev.units, b.name);
      if(!msg) continue;
      await sendOne(env, dev, msg, key, seen);
    }
  }
}

export const scheduled = async (event, env, ctx) => {
  const now = new Date();
  const cache = new Map(), seen = new Set();
  let cursor, devices = 0;
  do{
    const page = await env.KV.list({prefix:'dev:', cursor});
    for(const k of page.keys){
      const raw = await env.KV.get(k.name);
      if(!raw) continue;
      let dev;
      try{ dev = JSON.parse(raw); }catch(e){ continue; }
      devices++;
      try{ await runDevice(env, dev, now, cache, seen); }
      catch(e){ console.log('device failed', e && e.name); }
    }
    cursor = page.list_complete ? null : page.cursor;
  } while(cursor);
  console.log('cron done, devices', devices, 'sent', seen.size);
};
