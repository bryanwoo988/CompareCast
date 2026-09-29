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

if(typeof module !== 'undefined') module.exports = {minutesOf, inWindow, windowSlice, breaches};
