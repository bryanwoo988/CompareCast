/* The quarter-hourly reminder run for one device.

   Kept apart from the HTTP entry point so it can be driven end to end with
   KV, Open-Meteo and the push service all stood in (tests/cron.test.js). */
import {minutesOf, dueWindows, occurrence, windowIndices, aggregate, breaches} from '../../notifylogic.js';
import {messageForWindow, stormOfficialMessage, stormModelMessage, radarMessage, floodMessage} from './message.js';
import {WARN_API, STORM_MODELS, MODEL_COOLDOWN_S, liveWarnings, plotInAreas, modelSignal, modelAlert} from './storm.js';
import {RADAR_COOLDOWN_S, inMap, radarAt} from './radar.js';
import {FLOOD_URL, floodStations, floodNear} from './flood.js';
import {sentKey, sendOne, readLedger, writeLedger} from './send.js';
import {modelsParam, forModel} from './models.js';

const API = 'https://api.open-meteo.com/v1/forecast';

/* How long after its notify time a reminder may still go out. The cron runs
   every 15 minutes and a window used to be due in exactly one of those runs,
   so one slow reply from Open-Meteo or the push service at 06:00 meant no
   reminder that day. Four runs of grace, with the ledger stopping repeats. */
const DUE_GRACE_MIN = 60, CRON_SPAN_MIN = 15;

/* An encrypted push record tops out near 4 KB. The full per-plot detail is
   trimmed from the least severe end until the payload fits, and the count of
   what did not fit travels instead, so the app's reminder page can say so
   rather than quietly showing fewer plots. A body that still does not fit
   (fifty long names crossing six limits) is cut with an ellipsis. */
const PAYLOAD_BUDGET = 3000;
const byteSize = m => new TextEncoder().encode(JSON.stringify(m)).length;
function fitPayload(msg){
  let more = 0;
  while(Array.isArray(msg.detail) && msg.detail.length && byteSize(msg) > PAYLOAD_BUDGET){ msg.detail.pop(); more++; }
  if(Array.isArray(msg.detail) && !msg.detail.length) delete msg.detail;
  if(more) msg.more = more;
  let cut = msg.body.length;
  while(byteSize(msg) > PAYLOAD_BUDGET && cut > 40){ cut -= 20; msg.body = msg.body.slice(0, cut) + '…'; }
  return msg;
}

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

/* one request per coordinate and model per run, however many devices or
   windows want it; null when it fails, which leaves those plots for the next
   run rather than deciding them on nothing */
function forecast(run, lat, lon, tz, model){
  /* the zone is part of the key: it decides which wall-clock hours the reply
     is laid out in */
  const key = `${lat.toFixed(4)},${lon.toFixed(4)},${tz},${modelsParam(model)}`;
  if(run.cache.has(key)) return run.cache.get(key);
  const q = new URLSearchParams({
    latitude:String(lat), longitude:String(lon), timezone:tz, forecast_days:'3',
    hourly:'temperature_2m,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m'
  });
  if(modelsParam(model) !== 'best_match') q.set('models', modelsParam(model));
  const p = Promise.resolve()
    .then(() => run.fetchJson(API + '?' + q))
    .then(j => (j ? forModel(j.hourly, model) : null))
    .catch(() => null);
  run.cache.set(key, p);
  return p;
}

/* What is due now, grouped into one reminder per window and day. Each plot
   is scheduled on its own clock, so "6am" means 6am at the field rather than
   wherever the phone is; dev.tz only covers a plot synced before its forecast
   had loaded. */
function dueGroups(dev, now){
  const groups = new Map();
  for(const b of dev.blocks){
    const tz = b.tz || dev.tz;
    const {day, min} = localNow(tz, now);
    const mine = Array.isArray(b.windows) ? b.windows : [];
    for(const win of dueWindows(dev.notify.windows, min, DUE_GRACE_MIN)){
      if(!mine.includes(win.id)) continue;
      const occ = occurrence(win, min, day);
      if(!occ) continue;
      /* the last run still inside the grace hour: after this one the window
         is no longer due, so an undecided plot has to be decided now */
      let age = min - minutesOf(win.at); if(age < 0) age += 1440;
      const lastChance = age + CRON_SPAN_MIN >= DUE_GRACE_MIN;
      const key = sentKey(dev.id, win.id, occ.atDay);
      if(!groups.has(key)) groups.set(key, {key, win, atDay:occ.atDay, items:[]});
      groups.get(key).items.push({b, tz, occ, lastChance});
    }
  }
  return [...groups.values()];
}

/* Returns what happened, one entry per reminder, for the tests and for the
   run's counts. The caller logs numbers only: titles and bodies name plots. */
async function runDevice(env, dev, now, run){
  const report = [];
  if(!dev || !dev.notify || !Array.isArray(dev.notify.windows) || !Array.isArray(dev.blocks)) return report;

  for(const g of dueGroups(dev, now)){
    if(run.seen.has(g.key)) continue;
    const done = await readLedger(env, g.key);
    const entries = [], decided = [];

    for(const {b, tz, occ, lastChance} of g.items){
      if(done.has(b.id)) continue;
      const fc = await forecast(run, b.lat, b.lon, tz, b.model);
      /* one dated interval — a window crossing midnight included — less the
         hours already behind the notify time */
      const idx = fc ? windowIndices(fc.time, occ.day, g.win).filter(i => String(fc.time[i]) >= occ.cutoff) : [];
      if(!idx.length){
        if(run.stats) run.stats.noForecast++;
        /* retried by the next run; on the last one, said out loud instead —
           in threshold mode silence would read as "all clear" */
        if(lastChance){ decided.push(b.id); entries.push({id:b.id, name:b.name, noData:true}); }
        continue;
      }
      decided.push(b.id);
      const stats = aggregate(fc, idx);
      const hits = g.win.mode === 'threshold' ? breaches(dev.notify.rules, stats) : [];
      if(g.win.mode === 'threshold' && !hits.length) continue;
      entries.push({id:b.id, name:b.name, stats, hits});
    }
    if(!decided.length) continue;

    const msg = messageForWindow(dev.lang, g.win, entries, dev.notify.rules, dev.units);
    let result = 'quiet', loc;
    if(msg){
      /* its own tag, so it can never replace another reminder — the shared
         default is what used to leave one warning standing out of ten */
      msg.tag = `pw:${g.win.id}:${g.atDay}:${decided[0]}`;
      /* a reminder about one plot opens that plot when tapped */
      if(msg.ids.length === 1) loc = msg.loc = msg.ids[0];
      delete msg.ids;
      fitPayload(msg);
      result = await sendOne(env, dev, msg, run.post);
    }
    report.push({key:g.key, result, title:msg && msg.title, body:msg && msg.body, tag:msg && msg.tag, loc, ids:decided,
                 detail:msg && msg.detail ? msg.detail.length : 0, more:(msg && msg.more) || 0,
                 bytes:msg ? byteSize(msg) : 0});
    if(result === 'expired') break;                // the device is gone
    if(result === 'failed') continue;              // undecided: the next run tries again
    await writeLedger(env, g.key, [...done, ...decided]);
    run.seen.add(g.key);
  }
  return report;
}

/* ---- storm alerts ----
   Checked on every run, apart from the reminder windows: a storm does not
   wait for 6am. Official warnings are read once per run for every device;
   the model check only runs on the first run of each hour, since the models
   are hourly and seven of them per plot every quarter hour would eat the
   Open-Meteo allowance for nothing. */

const STORM_TZ = 'Asia/Kuala_Lumpur';
const hhmm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

function warnings(run){
  if(!run.warnings) run.warnings = Promise.resolve()
    .then(() => run.fetchJson(WARN_API))
    .then(j => (Array.isArray(j) ? j : null))
    .catch(() => null);
  return run.warnings;
}

function floodList(run){
  if(!run.floodList) run.floodList = Promise.resolve()
    .then(() => run.fetchJson(FLOOD_URL))
    .then(j => (Array.isArray(j) ? j : null))
    .catch(() => null);
  return run.floodList;
}

function stormForecast(run, lat, lon, tz){
  const key = `storm:${lat.toFixed(4)},${lon.toFixed(4)},${tz}`;
  if(run.cache.has(key)) return run.cache.get(key);
  const q = new URLSearchParams({
    latitude:String(lat), longitude:String(lon), timezone:tz, forecast_days:'2',
    hourly:'weather_code,precipitation,cape', models:STORM_MODELS.join(',')
  });
  const p = Promise.resolve()
    .then(() => run.fetchJson(API + '?' + q))
    .then(j => (j && j.hourly && Array.isArray(j.hourly.time) ? j.hourly : null))
    .catch(() => null);
  run.cache.set(key, p);
  return p;
}

/* finish a storm message the way reminders are finished, and send it */
async function deliver(env, dev, msg, tag, run){
  msg.tag = tag;
  let loc;
  if(msg.ids.length === 1) loc = msg.loc = msg.ids[0];
  delete msg.ids;
  fitPayload(msg);
  const result = await sendOne(env, dev, msg, run.post);
  return {result, title:msg.title, body:msg.body, tag, loc};
}

async function runStorm(env, dev, now, run){
  const report = [];
  const st = dev && dev.notify && dev.notify.storm;
  if(!st || (!st.official && !st.model && !st.flood) || !Array.isArray(dev.blocks)) return report;
  const plots = dev.blocks.filter(b => b && b.storm);
  if(!plots.length) return report;
  const myt = localNow(STORM_TZ, now);
  const nowMyt = `${myt.day}T${hhmm(myt.min)}`;
  /* plots under an official warning get no model heads-up on top of it */
  const covered = new Set();

  if(st.official){
    for(const w of liveWarnings(await warnings(run), nowMyt)){
      const hit = plots.filter(b => plotInAreas(b.geo, w.areas));
      hit.forEach(b => covered.add(b.id));
      if(!hit.length) continue;
      /* once per warning issue and plot; a reissue (a new issue time or end
         time) is news and goes out again */
      const key = `storm:o:${dev.id}:${w.issued || ''}:${w.to}`;
      if(run.seen.has(key)) continue;
      const done = await readLedger(env, key);
      const todo = hit.filter(b => !done.has(b.id));
      if(!todo.length) continue;
      const msg = stormOfficialMessage(dev.lang, w, todo.map(b => ({id:b.id, name:b.name, geo:b.geo})), nowMyt);
      const r = await deliver(env, dev, msg, `pw:storm:o:${w.issued || ''}:${w.to}:${todo[0].id}`, run);
      report.push(Object.assign({kind:'official', key, ids:todo.map(b => b.id)}, r));
      if(r.result === 'expired') return report;
      if(r.result === 'failed') continue;
      await writeLedger(env, key, [...done, ...todo.map(b => b.id)]);
      run.seen.add(key);
    }
  }

  if(st.flood){
    const live = floodStations(await floodList(run), nowMyt);
    const due = [], marks = [];
    for(const b of plots){
      const near = floodNear(live, b.lat, b.lon);
      if(!near.length) continue;
      /* each station once per level per day: again only if it climbs from
         Warning to Danger */
      const key = `storm:f:${dev.id}:${b.id}`;
      let seen = {};
      try{ seen = JSON.parse(await env.KV.get(key) || '{}') || {}; }catch(e){ seen = {}; }
      const fresh = near.filter(x => !(seen[x.id] >= x.rank));
      if(!fresh.length) continue;
      due.push({id:b.id, name:b.name, stations:fresh});
      near.forEach(x => { seen[x.id] = Math.max(seen[x.id] || 0, x.rank); });
      marks.push([key, seen]);
    }
    if(due.length){
      const msg = floodMessage(dev.lang, due);
      const r = await deliver(env, dev, msg, `pw:flood:${nowMyt}:${due[0].id}`, run);
      report.push(Object.assign({kind:'flood', ids:due.map(x => x.id)}, r));
      if(r.result === 'expired') return report;
      if(r.result === 'sent')
        for(const [key, seen] of marks) await env.KV.put(key, JSON.stringify(seen), {expirationTtl:86400});
    }
  }

  if(st.model && run.modelHour){
    const due = [];
    for(const b of plots){
      if(covered.has(b.id)) continue;
      const tz = b.tz || dev.tz;
      const fc = await stormForecast(run, b.lat, b.lon, tz);
      if(!fc) continue;
      const {day, min} = localNow(tz, now);
      const sig = modelSignal(fc, fc.time.indexOf(`${day}T${hhmm(min).slice(0, 2)}:00`));
      if(!modelAlert(sig)) continue;
      const cool = `storm:m:${dev.id}:${b.id}`;
      if(await env.KV.get(cool)) continue;
      due.push({id:b.id, name:b.name, sig, cool});
    }
    if(due.length){
      const msg = stormModelMessage(dev.lang, due);
      const r = await deliver(env, dev, msg, `pw:storm:m:${nowMyt}:${due[0].id}`, run);
      report.push(Object.assign({kind:'model', ids:due.map(x => x.id)}, r));
      if(r.result === 'sent')
        for(const x of due) await env.KV.put(x.cool, '1', {expirationTtl:MODEL_COOLDOWN_S});
    }
  }
  return report;
}

/* ---- radar ----
   Runs on its own five-minute schedule against grids decoded once per run
   (index.js). `frameMs` is the newest radar frame's time. */
const hmOf = ms => { const {min} = localNow(STORM_TZ, new Date(ms)); return hhmm(min); };

async function runRadar(env, dev, grids, frameMs, now, run){
  const report = [];
  const st = dev && dev.notify && dev.notify.storm;
  if(!st || !st.radar || !Array.isArray(dev.blocks) || !grids) return report;
  const due = [];
  for(const b of dev.blocks){
    if(!b || !b.storm || !inMap(b.lat, b.lon)) continue;
    const r = radarAt(grids, b.lat, b.lon);
    if(!r) continue;
    let at;
    if(r.kind === 'coming'){
      const arrive = frameMs + r.min * 60000;
      /* the frame is 11–20 minutes old by now: an arrival already behind us
         is left for the next frame to show as rain nearby */
      if(arrive <= now.getTime()) continue;
      at = hmOf(arrive);
    }
    const cool = `storm:r:${dev.id}:${b.id}`;
    if(await env.KV.get(cool)) continue;
    due.push({id:b.id, name:b.name, r, at, cool, model:`storm:m:${dev.id}:${b.id}`});
  }
  if(!due.length) return report;
  const msg = radarMessage(dev.lang, due, hmOf(frameMs));
  const r = await deliver(env, dev, msg, `pw:radar:${frameMs}:${due[0].id}`, run);
  report.push(Object.assign({kind:'radar', ids:due.map(x => x.id)}, r));
  if(r.result === 'sent'){
    for(const x of due){
      await env.KV.put(x.cool, '1', {expirationTtl:RADAR_COOLDOWN_S});
      /* the radar has seen the real thing: no model guess about it as well */
      await env.KV.put(x.model, '1', {expirationTtl:MODEL_COOLDOWN_S});
    }
  }
  return report;
}

export {runDevice, runStorm, runRadar, localNow, DUE_GRACE_MIN};
