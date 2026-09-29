/* Validation and normalisation for the subscribe payload.

   Everything here arrives from a phone we do not control, so nothing is
   trusted — least of all the list of window ids each block claims to be
   subscribed to, which is cross-checked against the windows the same payload
   declares rather than taken at face value.

   Nothing is stored as sent, either. Every object is rebuilt from the fields
   the worker actually reads: the cron parses every device every quarter hour
   on a 10 ms CPU budget shared by all of them, so a single payload padded
   with junk used to be able to stall reminders for everyone. */
import {minutesOf} from '../../notifylogic.js';
import {MODEL_IDS} from './models.js';

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const LANGS = ['zh', 'en', 'ms'];
const MAX_BLOCKS = 50;
const WINDOW_IDS = ['morning', 'afternoon', 'evening', 'night'];
const MODES = ['threshold', 'digest'];
const RULE_KEYS = ['rainProb', 'rainSum', 'tMax', 'tMin', 'wind', 'gust'];
const UNITS = {temp:['celsius', 'fahrenheit'], wind:['kmh', 'mph', 'kn', 'ms'], rain:['mm', 'inch']};

/* The cron POSTs to the stored endpoint with a JWT signed by this app's VAPID
   key. Left open to any https URL, the worker would relay to whatever host
   anyone registered; these are the services browsers actually issue. */
const PUSH_HOSTS = [
  h => h === 'fcm.googleapis.com',                       // Chrome, Android, Edge on Android, Samsung
  h => h === 'web.push.apple.com',                       // Safari, iOS home-screen apps
  h => h === 'updates.push.services.mozilla.com',        // Firefox
  h => /^[a-z0-9-]+\.notify\.windows\.com$/.test(h)      // Edge on Windows
];

function validTz(tz){
  if(typeof tz !== 'string' || !tz) return false;
  try{ new Intl.DateTimeFormat('en', {timeZone:tz}); return true; }
  catch(e){ return false; }
}

const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

function cleanUnits(u){
  const src = u && typeof u === 'object' ? u : {};
  const out = {};
  Object.keys(UNITS).forEach(k => { out[k] = UNITS[k].includes(src[k]) ? src[k] : UNITS[k][0]; });
  return out;
}

/* a window missing any usable time is dropped whole: half a window would be
   scheduled on one clock and summarised on another */
function cleanWindows(ws){
  if(!Array.isArray(ws)) return [];
  const out = [];
  ws.forEach(w => {
    if(!w || typeof w !== 'object' || !WINDOW_IDS.includes(w.id)) return;
    if(out.some(x => x.id === w.id)) return;
    if([w.from, w.to, w.at].some(t => minutesOf(t) < 0)) return;
    out.push({id:w.id, on:w.on === true, from:w.from, to:w.to, at:w.at,
              mode:MODES.includes(w.mode) ? w.mode : 'threshold'});
  });
  return out;
}

function cleanRules(r){
  const src = r && typeof r === 'object' ? r : {};
  const out = {};
  RULE_KEYS.forEach(k => {
    const x = src[k];
    if(x && typeof x === 'object' && typeof x.on === 'boolean' && num(x.v, -100, 1000))
      out[k] = {on:x.on, v:x.v};
  });
  return out;
}

function validateSub(body){
  const bad = error => ({ok:false, error});
  if(!body || typeof body !== 'object') return bad('body');

  if(!ID_RE.test(String(body.id || ''))) return bad('id');
  if(!validTz(body.tz)) return bad('tz');

  const sub = body.sub;
  if(!sub || typeof sub !== 'object') return bad('sub');
  let url;
  try{ url = new URL(sub.endpoint); }catch(e){ return bad('endpoint'); }
  if(url.protocol !== 'https:' || !PUSH_HOSTS.some(ok => ok(url.hostname))) return bad('endpoint');
  const keys = sub.keys || {};
  if(typeof keys.p256dh !== 'string' || !keys.p256dh || keys.p256dh.length > 200) return bad('p256dh');
  if(typeof keys.auth !== 'string' || !keys.auth || keys.auth.length > 100) return bad('auth');

  const notify = body.notify;
  if(!notify || typeof notify !== 'object') return bad('notify');
  const windows = cleanWindows(notify.windows);
  if(!windows.length) return bad('notify');

  /* the only window ids that may survive are ones this payload both declares
     and has switched on */
  const live = new Set(windows.filter(w => w.on).map(w => w.id));

  const raw = Array.isArray(body.blocks) ? body.blocks : [];
  if(raw.length > MAX_BLOCKS) return bad('blocks');
  const blocks = [];
  for(const b of raw){
    if(!b || typeof b !== 'object') return bad('block');
    if(typeof b.id !== 'string' || !b.id || b.id.length > 64) return bad('blockId');
    if(!num(b.lat, -90, 90) || !num(b.lon, -180, 180)) return bad('coords');
    const bw = (Array.isArray(b.windows) ? b.windows : []).filter(w => live.has(w));
    if(!bw.length) continue;                   // nothing to send for this block
    /* the plot's own zone when the client knew it; validated the same way as
       the device zone so a bad value cannot break the cron */
    const btz = validTz(b.tz) ? b.tz : undefined;
    /* the plot's model, so a reminder quotes the figures its page shows; an
       unknown one falls back to Best Match rather than failing the request */
    const model = MODEL_IDS.includes(b.model) ? b.model : undefined;
    blocks.push({id:b.id, name:String(b.name || '').slice(0, 80), lat:b.lat, lon:b.lon,
                 windows:[...new Set(bw)], tz:btz, model});
  }
  if(!blocks.length) return bad('noBlocks');

  return {ok:true, value:{
    id:body.id, tz:body.tz,
    lang:LANGS.includes(body.lang) ? body.lang : 'en',
    units:cleanUnits(body.units),
    sub:{endpoint:sub.endpoint, keys:{p256dh:keys.p256dh, auth:keys.auth}},
    notify:{windows, rules:cleanRules(notify.rules)},
    blocks,
    at:Date.now()
  }};
}

export {validateSub, PUSH_HOSTS};
