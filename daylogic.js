/* Pure day-slicing helpers for the detail page.

   Every comparison here is a string prefix compare. Open-Meteo returns hourly
   timestamps as local wall-clock with `timezone=auto` and no zone suffix, so
   `new Date(...)` would re-interpret them in the runtime's zone and shift the
   two DST days of the year by an hour. Strings never drift. */

/* first index and length of `dayISO` (YYYY-MM-DD) inside an hourly time array */
function sliceDay(times, dayISO){
  if(!times || !times.length || !dayISO) return {start:-1, n:0};
  let start = -1;
  for(let i = 0; i < times.length; i++){
    if(String(times[i]).slice(0,10) !== dayISO) continue;
    start = i;
    break;
  }
  if(start < 0) return {start:-1, n:0};
  let n = 0;
  /* count the run, so a 23- or 25-hour DST day and a truncated last day all
     report their real length instead of an assumed 24 */
  while(start + n < times.length && String(times[start + n]).slice(0,10) === dayISO) n++;
  return {start, n};
}

/* indices of the highest and lowest non-null value; {-1,-1} when all null */
function extremaOf(values){
  let hiIdx = -1, loIdx = -1;
  if(!values) return {hiIdx, loIdx};
  for(let i = 0; i < values.length; i++){
    const v = values[i];
    if(v === null || v === undefined || Number.isNaN(v)) continue;
    if(hiIdx < 0 || v > values[hiIdx]) hiIdx = i;
    if(loIdx < 0 || v < values[loIdx]) loIdx = i;
  }
  return {hiIdx, loIdx};
}

/* position of the hour containing `nowISO` within `times`; -1 when absent */
function nowIndex(times, nowISO){
  if(!times || !times.length || !nowISO) return -1;
  const hour = String(nowISO).slice(0,13);
  for(let i = 0; i < times.length; i++)
    if(String(times[i]).slice(0,13) === hour) return i;
  return -1;
}

if(typeof module !== 'undefined') module.exports = {sliceDay, extremaOf, nowIndex};
