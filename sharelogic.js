/* The shared forecast picture: what goes on it, worked out from payloads
   already on the detail page. Pure functions, kept out of app.js so they
   run under the tests; the drawing itself is in app.js.

   The picture is for sending to workers, so it answers the questions they
   ask: will it rain today and tomorrow, and roughly when (two-hour blocks
   across the working day), and what the next few days look like. */

/* The more serious of two WMO weather codes. Thunderstorms 95–99 outrank
   showers 80–86, which outrank rain 61–67, drizzle 51–57, fog 45–48 and
   cloud 0–3; within a group a higher code is heavier. One block of two hours
   shows the worse of its hours, so a storm in either hour is not hidden. */
function shareRank(c){
  if(typeof c !== 'number' || !isFinite(c)) return -1;
  if(c >= 95) return 600 + c;
  if(c >= 80) return 500 + c;
  if(c >= 61 && c <= 67) return 400 + c;
  if(c >= 71 && c <= 77) return 400 + c;
  if(c >= 51 && c <= 57) return 300 + c;
  if(c >= 45 && c <= 48) return 200 + c;
  return 100 + c;
}
function worseCode(a, b){ return shareRank(b) > shareRank(a) ? b : a; }

var shNum = function(v){ return typeof v === 'number' && isFinite(v) ? v : null; };

/* Blocks of `step` hours on `day` (YYYY-MM-DD), from `fromH` up to `toH`
   (exclusive). `h` holds the hourly arrays, all on h.time ('YYYY-MM-DDTHH:MM',
   local time); `prob` may be missing, or keyed by the same time strings.
   Each block: its first hour, the worse weather code, whether it is day,
   the temperature at its start, rain summed over it, the highest chance.
   A block with no hours in the data is left out. */
function shareStrip(h, day, fromH, toH, step){
  if(!h || !Array.isArray(h.time) || typeof day !== 'string') return [];
  var at = {};
  h.time.forEach(function(t, i){ if(typeof t === 'string' && t.slice(0, 10) === day) at[+t.slice(11, 13)] = i; });
  var out = [];
  for(var s = fromH; s < toH; s += step){
    var b = {hour:s, code:null, isDay:1, temp:null, rain:null, prob:null}, any = false;
    for(var k = s; k < s + step && k < toH; k++){
      var i = at[k];
      if(i === undefined) continue;
      if(!any){
        b.temp = shNum(h.temp && h.temp[i]);
        b.isDay = h.isDay && h.isDay[i] === 0 ? 0 : 1;
      }
      any = true;
      var c = shNum(h.code && h.code[i]);
      if(c !== null) b.code = b.code === null ? c : worseCode(b.code, c);
      var r = shNum(h.rain && h.rain[i]);
      if(r !== null) b.rain = (b.rain || 0) + r;
      var p = h.prob ? shNum(h.prob[h.time[i]]) : null;
      if(p !== null) b.prob = b.prob === null ? p : Math.max(b.prob, p);
    }
    if(any) out.push(b);
  }
  return out;
}

/* `n` days from index `from` of the daily arrays */
function shareDays(d, from, n){
  if(!d || !Array.isArray(d.time)) return [];
  var out = [];
  for(var i = from; i < d.time.length && out.length < n; i++){
    out.push({date:d.time[i], code:shNum(d.code && d.code[i]), min:shNum(d.min && d.min[i]), max:shNum(d.max && d.max[i]),
      rain:shNum(d.rain && d.rain[i]), prob:shNum(d.prob && d.prob[i])});
  }
  return out;
}

/* hourly chance of rain keyed by time, from the extras payload */
function probByTime(time, prob){
  var m = {};
  if(Array.isArray(time) && Array.isArray(prob)) time.forEach(function(t, i){ if(shNum(prob[i]) !== null) m[t] = prob[i]; });
  return m;
}

/* the file name: the place's name made safe, and the day */
function shareFileName(name, day){
  var n = String(name || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  return (n || 'forecast') + ' ' + (day || '') + '.png';
}

if(typeof module !== 'undefined') module.exports = {shareRank, worseCode, shareStrip, shareDays, probByTime, shareFileName};
