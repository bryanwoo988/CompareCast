/* Pure decision logic for weather reminders.

   Kept free of the DOM on purpose: the push backend (sub-project B) has to make
   exactly the same judgement server-side. If the phone and the server disagreed,
   the app would promise reminders that never arrive. */

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/* 'HH:MM' as minutes past midnight; -1 for anything that is not a valid time.
   The time inputs hand back '' when cleared, so this is the gate on that. */
function minutesOf(hhmm){
  const m = HHMM.exec(String(hhmm == null ? '' : hhmm));
  return m ? (+m[1]) * 60 + (+m[2]) : -1;
}

/* Start inclusive, end exclusive. `to <= from` means the window wraps past
   midnight — the 00:00-06:00 slot is one of the four the app ships with, so
   the naive from<=m<to test would leave it permanently empty. */
function inWindow(win, minutes){
  const from = minutesOf(win && win.from), to = minutesOf(win && win.to);
  if(from < 0 || to < 0 || minutes < 0) return false;
  return to > from ? (minutes >= from && minutes < to)
                   : (minutes >= from || minutes < to);
}

/* The run of hourly samples on `dayISO` that fall inside the window. Times are
   Open-Meteo's local wall-clock strings, compared as text for the date and by
   minutes for the hour. */
function windowSlice(times, dayISO, win){
  const none = {start:-1, n:0};
  if(!times || !times.length || !dayISO) return none;
  let start = -1, n = 0;
  for(let i = 0; i < times.length; i++){
    const s = String(times[i]);
    if(s.slice(0, 10) !== dayISO) continue;
    if(!inWindow(win, minutesOf(s.slice(11, 16)))) continue;
    if(start < 0) start = i;
    n++;
  }
  return start < 0 ? none : {start, n};
}

/* Which enabled rules the window's aggregates break. tMin is a floor warning,
   so it triggers going down while every other rule triggers going up. */
function breaches(rules, stats){
  const out = [];
  if(!rules || !stats) return out;
  Object.keys(rules).forEach(key => {
    const r = rules[key];
    if(!r || !r.on) return;
    const v = stats[key];
    if(typeof v !== 'number' || !Number.isFinite(v)) return;
    if(key === 'tMin' ? v <= r.v : v >= r.v) out.push(key);
  });
  return out;
}

/* Which windows come due in the quarter hour that just passed.

   The interval is half-open — (now - span, now] — so a notify time landing
   exactly on a boundary fires in one run and one run only. Closing both ends
   would send the same reminder twice. */
function dueWindows(windows, nowMin, spanMin){
  if(!Array.isArray(windows)) return [];
  return windows.filter(w => {
    if(!w || !w.on) return false;
    const at = minutesOf(w.at);
    if(at < 0) return false;
    let age = nowMin - at;
    if(age < 0) age += 1440;      /* the run just after midnight still owes the late-night slots */
    return age >= 0 && age < spanMin;
  });
}

/* 'YYYY-MM-DD' moved by n days on the calendar alone. Noon UTC keeps the
   arithmetic clear of any daylight-saving edge; the result is only a date. */
function addDays(dayISO, n){
  const d = new Date(dayISO + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* The dates a window touches. A wrapping window runs into the next day, and
   an hourly slice taken for one date alone would silently lose that half. */
function spanDays(win, dayISO){
  const from = minutesOf(win && win.from), to = minutesOf(win && win.to);
  if(from < 0 || to < 0 || to > from) return [dayISO];
  return [dayISO, addDays(dayISO, 1)];
}

/* The hours of one instance of a window, as explicit indices into `times`.

   The window is one dated interval: from `from` on dayISO to `to` on the
   same day, or on the next when it crosses midnight (an equal start and end
   is a full day). windowSlice's start-and-count could only describe
   consecutive matches, and a window crossing midnight never is on one date —
   the cron read 00:00-03:00 twice and missed the evening entirely. Times are
   Open-Meteo's local wall-clock strings, so they compare as text. */
function windowIndices(times, dayISO, win){
  const from = minutesOf(win && win.from), to = minutesOf(win && win.to);
  if(from < 0 || to < 0 || !dayISO || !Array.isArray(times)) return [];
  const hhmm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const start = `${dayISO}T${hhmm(from)}`;
  const end = `${to > from ? dayISO : addDays(dayISO, 1)}T${hhmm(to)}`;
  const out = [];
  times.forEach((t, i) => { const s = String(t).slice(0, 16); if(s >= start && s < end) out.push(i); });
  return out;
}

/* Which instance of a window a reminder is about, from the local date and
   minute a run sees.

   atDay  — the date the notify time fell on. A run just after midnight can
            still be delivering a 23:50 reminder, and that belongs to the day
            before. Every retry of one reminder must agree on it, because it
            keys the de-duplication.
   day    — the date that instance of the window starts on. A reminder is
            about what is still ahead: once the window has ended by the notify
            time it means the next one. This used to be missing, so a 21:00
            reminder for the 06:00-12:00 slot summarised the morning that had
            already gone — the one case, planning tomorrow's spraying the night
            before, that an evening reminder exists for.
   cutoff — hours before the notify time's own hour are over and are left
            out, the rule the in-app sentence follows too. */
function occurrence(win, nowMin, dayISO){
  const from = minutesOf(win && win.from), to = minutesOf(win && win.to), at = minutesOf(win && win.at);
  if(from < 0 || to < 0 || at < 0 || !(nowMin >= 0) || !dayISO) return null;
  const atDay = at <= nowMin ? dayISO : addDays(dayISO, -1);
  const day = to > from
    ? (at >= to ? addDays(atDay, 1) : atDay)
    /* wrapping: before `to` the instance that began last night is running */
    : (at < to ? addDays(atDay, -1) : atDay);
  const hh = String(Math.floor(at / 60)).padStart(2, '0');
  return {atDay, day, cutoff:`${atDay}T${hh}:00`};
}

/* Aggregates for the hours named by `idx`. A series with nothing usable in it
   reports null rather than 0 — "no data" and "zero rain" are different claims
   and only one of them should be allowed to trip a threshold. */
function aggregate(hourly, idx){
  const pick = name => {
    const arr = hourly && hourly[name];
    if(!Array.isArray(arr)) return [];
    return idx.map(i => arr[i]).filter(v => typeof v === 'number' && Number.isFinite(v));
  };
  const max = a => a.length ? Math.max.apply(null, a) : null;
  const min = a => a.length ? Math.min.apply(null, a) : null;
  const sum = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) * 100) / 100 : null;
  const temp = pick('temperature_2m');
  return {
    rainProb:max(pick('precipitation_probability')),
    rainSum:sum(pick('precipitation')),
    tMax:max(temp),
    tMin:min(temp),
    wind:max(pick('wind_speed_10m')),
    gust:max(pick('wind_gusts_10m'))
  };
}

/* What the reminder page should say about registration.

   Written as its own function because the first version got this exactly
   backwards: it treated every state that was not "syncing" or "failed" as
   success, so a device that had never registered at all was shown a green
   tick. The user trusted it and waited for a notification nothing would send.
   Success is now a state that has to be earned, not a default. */
function syncMessage(state, enabled, permission){
  if(!enabled) return {kind:'warn', reason:'disabled'};
  if(permission !== 'granted') return {kind:'warn', reason:'permission'};
  /* nothing ticked is a choice, not a failure — the server rightly rejects an
     empty block list, but showing the user HTTP 400 for it would be absurd */
  if(state === 'noblocks') return {kind:'warn', reason:'noblocks'};
  if(state === 'synced') return {kind:'ok'};
  if(state === 'syncing') return {kind:'busy'};
  /* anything else — including never having tried — is not success */
  return {kind:'err', reason:state || 'unknown'};
}

/* The plots a device actually wants reminders for: each one's ticked windows
   narrowed to those switched on, and plots left with none dropped. The local
   ticks are not touched, so switching a window back on restores them.

   Checking only "has ticks" used to POST plots whose windows were all off;
   the server rejected the lot and the old schedule kept sending. */
function effectiveBlocks(locations, windows){
  const on = new Set((Array.isArray(windows) ? windows : []).filter(w => w && w.on).map(w => w.id));
  return (Array.isArray(locations) ? locations : [])
    .map(l => ({loc:l, windows:(Array.isArray(l && l.notify) ? l.notify : []).filter(id => on.has(id))}))
    .filter(x => x.windows.length)
    .map(x => ({id:x.loc.id, loc:x.loc, windows:x.windows}));
}

/* The id this device registers under — the server's only proof of ownership,
   so it has to be unguessable, and it has to match the server's pattern.
   The old fallback (Date.now() + Math.random()) carried a '.', so phones
   without randomUUID were refused on every attempt, permanently. */
const DEVICE_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const validDeviceId = id => typeof id === 'string' && DEVICE_ID_RE.test(id);
function makeDeviceId(c){
  if(c && typeof c.randomUUID === 'function') return c.randomUUID().replace(/-/g, '').slice(0, 32);
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}

/* numeric, segment by segment — '3.10.0' is newer than '3.9.0', which a
   string compare gets backwards */
function cmpVersion(a, b){
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for(let i = 0; i < Math.max(pa.length, pb.length); i++){
    const x = pa[i] || 0, y = pb[i] || 0;
    if(x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/* release entries newer than the version the user last saw */
function notesSince(releases, seen){
  if(!Array.isArray(releases)) return [];
  if(!seen) return releases.slice();
  return releases.filter(r => cmpVersion(r.v, seen) > 0);
}

if(typeof module !== 'undefined') module.exports = {minutesOf, inWindow, windowSlice, breaches, dueWindows, spanDays, addDays, occurrence, windowIndices, aggregate, syncMessage, cmpVersion, notesSince, effectiveBlocks, makeDeviceId, validDeviceId};
