/* The quarter-hourly reminder run for one device.

   Kept apart from the HTTP entry point so it can be driven end to end with
   KV, Open-Meteo and the push service all stood in (tests/cron.test.js). */
import {dueWindows, occurrence, spanDays, windowSlice, aggregate, breaches} from '../../notifylogic.js';
import {messageForWindow} from './message.js';
import {sentKey, sendOne, readLedger, writeLedger} from './send.js';
import {modelsParam, forModel} from './models.js';

const API = 'https://api.open-meteo.com/v1/forecast';

/* How long after its notify time a reminder may still go out. The cron runs
   every 15 minutes and a window used to be due in exactly one of those runs,
   so one slow reply from Open-Meteo or the push service at 06:00 meant no
   reminder that day. Four runs of grace, with the ledger stopping repeats. */
const DUE_GRACE_MIN = 60;

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
  const key = `${lat.toFixed(4)},${lon.toFixed(4)},${modelsParam(model)}`;
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
      const key = sentKey(dev.id, win.id, occ.atDay);
      if(!groups.has(key)) groups.set(key, {key, win, atDay:occ.atDay, items:[]});
      groups.get(key).items.push({b, tz, occ});
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

    for(const {b, tz, occ} of g.items){
      if(done.has(b.id)) continue;
      const fc = await forecast(run, b.lat, b.lon, tz, b.model);
      if(!fc) continue;
      /* both dates of a wrapping window, less the hours already behind the
         notify time */
      const idx = [];
      for(const d of spanDays(g.win, occ.day)){
        const {start, n} = windowSlice(fc.time, d, g.win);
        for(let i = 0; i < n; i++) if(String(fc.time[start + i]) >= occ.cutoff) idx.push(start + i);
      }
      if(!idx.length) continue;
      decided.push(b.id);
      const stats = aggregate(fc, idx);
      const hits = g.win.mode === 'threshold' ? breaches(dev.notify.rules, stats) : [];
      if(g.win.mode === 'threshold' && !hits.length) continue;
      entries.push({name:b.name, stats, hits});
    }
    if(!decided.length) continue;

    const msg = messageForWindow(dev.lang, g.win, entries, dev.notify.rules, dev.units);
    let result = 'quiet';
    if(msg){
      /* its own tag, so it can never replace another reminder — the shared
         default is what used to leave one warning standing out of ten */
      msg.tag = `pw:${g.win.id}:${g.atDay}:${decided[0]}`;
      result = await sendOne(env, dev, msg, run.post);
    }
    report.push({key:g.key, result, title:msg && msg.title, body:msg && msg.body, tag:msg && msg.tag, ids:decided});
    if(result === 'expired') break;                // the device is gone
    if(result === 'failed') continue;              // undecided: the next run tries again
    await writeLedger(env, g.key, [...done, ...decided]);
    run.seen.add(g.key);
  }
  return report;
}

export {runDevice, localNow, DUE_GRACE_MIN};
