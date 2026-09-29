/* Validation and normalisation for the subscribe payload.

   Everything here arrives from a phone we do not control, so nothing is
   trusted — least of all the list of window ids each block claims to be
   subscribed to, which is cross-checked against the windows the same payload
   declares rather than taken at face value. */

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const LANGS = ['zh', 'en', 'ms'];
const MAX_BLOCKS = 50;

function validTz(tz){
  if(typeof tz !== 'string' || !tz) return false;
  try{ new Intl.DateTimeFormat('en', {timeZone:tz}); return true; }
  catch(e){ return false; }
}

const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

function validateSub(body){
  const bad = error => ({ok:false, error});
  if(!body || typeof body !== 'object') return bad('body');

  if(!ID_RE.test(String(body.id || ''))) return bad('id');
  if(!validTz(body.tz)) return bad('tz');

  const sub = body.sub;
  if(!sub || typeof sub !== 'object') return bad('sub');
  let url;
  try{ url = new URL(sub.endpoint); }catch(e){ return bad('endpoint'); }
  if(url.protocol !== 'https:') return bad('endpoint');
  const keys = sub.keys || {};
  if(typeof keys.p256dh !== 'string' || !keys.p256dh) return bad('p256dh');
  if(typeof keys.auth !== 'string' || !keys.auth) return bad('auth');

  const notify = body.notify;
  if(!notify || !Array.isArray(notify.windows) || !notify.windows.length) return bad('notify');

  /* the only window ids that may survive are ones this payload both declares
     and has switched on */
  const live = new Set(notify.windows.filter(w => w && w.on).map(w => w.id));

  const raw = Array.isArray(body.blocks) ? body.blocks : [];
  if(raw.length > MAX_BLOCKS) return bad('blocks');
  const blocks = [];
  for(const b of raw){
    if(!b || typeof b !== 'object') return bad('block');
    if(typeof b.id !== 'string' || !b.id) return bad('blockId');
    if(!num(b.lat, -90, 90) || !num(b.lon, -180, 180)) return bad('coords');
    const windows = (Array.isArray(b.windows) ? b.windows : []).filter(w => live.has(w));
    if(!windows.length) continue;              // nothing to send for this block
    /* the plot's own zone when the client knew it; validated the same way as
       the device zone so a bad value cannot break the cron */
    const btz = validTz(b.tz) ? b.tz : undefined;
    blocks.push({id:b.id, name:String(b.name || '').slice(0, 80), lat:b.lat, lon:b.lon, windows, tz:btz});
  }
  if(!blocks.length) return bad('noBlocks');

  const lang = LANGS.includes(body.lang) ? body.lang : 'en';
  const units = (body.units && typeof body.units === 'object') ? body.units : {};

  return {ok:true, value:{
    id:body.id, tz:body.tz, lang, units,
    sub:{endpoint:sub.endpoint, keys:{p256dh:keys.p256dh, auth:keys.auth}},
    notify:{windows:notify.windows, rules:notify.rules || {}},
    blocks,
    at:Date.now()
  }};
}

export {validateSub};
