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

/* The dates a window touches. A wrapping window runs into the next day, and
   an hourly slice taken for one date alone would silently lose that half. */
function spanDays(win, dayISO){
  const from = minutesOf(win && win.from), to = minutesOf(win && win.to);
  if(from < 0 || to < 0 || to > from) return [dayISO];
  const d = new Date(dayISO + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return [dayISO, d.toISOString().slice(0, 10)];
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

if(typeof module !== 'undefined') module.exports = {minutesOf, inWindow, windowSlice, breaches, dueWindows, spanDays, aggregate, syncMessage};
