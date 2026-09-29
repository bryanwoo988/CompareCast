/* Request bookkeeping kept out of the DOM code so it can be tested.

   Both external reviews of the v3.10.0 snapshot found the same class of bug:
   an await or .then writing to shared state after the user had moved on — a
   Celsius reply landing after the Fahrenheit one, an old compare request
   overwriting a newer model selection. And both found that nothing on screen
   said how old the numbers were. */

/* "Latest request wins". begin(key) issues a token for a new request on that
   key; the token answers true only while no newer request has been issued.
   Every async write asks its token first. */
function makeLatest(){
  const gen = new Map();
  return {
    begin(key){
      const n = (gen.get(key) || 0) + 1;
      gen.set(key, n);
      return () => gen.get(key) === n;
    }
  };
}

/* How old a payload is and what that should mean on screen.

   refresh  — older than half an hour: fetch again when the app is looked at
   stale    — older than three hours: grey it out and say so
   otherDay — fetched on an earlier local date: "today" and the "now" marker
              on it are no longer today's

   A missing stamp counts as old: numbers of unknown age must not pass for
   current ones. `offsetMin` is the local zone's offset from UTC, passed in by
   the tests and read from the device otherwise. */
const REFRESH_MIN = 30, STALE_H = 3;
function freshness(at, now, offsetMin){
  if(typeof at !== 'number' || !isFinite(at)) return {refresh:true, stale:true, otherDay:true, hours:null};
  const off = typeof offsetMin === 'number' ? offsetMin : -new Date(now).getTimezoneOffset();
  const day = t => Math.floor((t + off * 60e3) / 86400e3);
  const age = Math.max(0, now - at);
  return {
    refresh:age > REFRESH_MIN * 60e3,
    stale:age > STALE_H * 3600e3,
    otherDay:day(at) !== day(now),
    hours:Math.floor(age / 3600e3)
  };
}

if(typeof module !== 'undefined') module.exports = {makeLatest, freshness, REFRESH_MIN, STALE_H};
