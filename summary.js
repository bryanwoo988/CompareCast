/* The plain-language verdict for a day.

   Returns a structured conclusion, not a sentence: the three languages share
   one judgement, and the judgement is what needs testing. Wording is the
   caller's job.

   A sentence carries more weight than a number. "No rain today" read as
   permission to spray, when it does rain, is worse than a column of figures
   nobody acted on — so the thresholds lean toward saying rain is possible. */

const RAIN_PROB = 50;   /* a coin flip is already worth planning around */
const RUN_LEN = 2;      /* two hours running is weather; one hour is a shower */
const HOT_C = 34;

const num = v => typeof v === 'number' && Number.isFinite(v);

/* stretches of at least `minLen` consecutive hours at or above `minProb` */
function rainRuns(probs, minProb, minLen){
  const out = [];
  if(!Array.isArray(probs)) return out;
  let start = -1, peak = 0;
  const close = end => {
    if(start >= 0 && end - start + 1 >= minLen) out.push({from:start, to:end, peak});
    start = -1; peak = 0;
  };
  for(let i = 0; i < probs.length; i++){
    const v = probs[i];
    if(num(v) && v >= minProb){
      if(start < 0) start = i;
      if(v > peak) peak = v;
    } else close(i - 1);
  }
  close(probs.length - 1);
  return out;
}

function partOfDay(hour){
  if(hour < 6) return 'night';
  if(hour < 12) return 'morning';
  if(hour < 18) return 'afternoon';
  return 'evening';
}

/* `from` is the first hour still ahead of the user; on today that is the
   current hour, because rain that already fell is not a decision to make */
function summarize(o){
  const all = Array.isArray(o.probs) ? o.probs : [];
  const from = Math.max(0, o.from | 0);
  const ahead = all.slice(from);
  if(!ahead.some(num)) return {kind:'unknown'};

  /* Hours already past were not examined, so the caller must not word the
     result as a claim about the whole day. Saying "no rain all day" on an
     evening when the morning was wet contradicts every other figure on the
     page, which is how this flag came to exist. */
  const rest = from > 0;

  const runs = rainRuns(ahead, RAIN_PROB, RUN_LEN);
  if(runs.length){
    const r = runs.reduce((a, b) => (b.peak > a.peak ? b : a));
    return {kind:'rain', rest, from:r.from + from, to:r.to + from, peak:r.peak,
            part:partOfDay(r.from + from)};
  }

  /* nothing sustained, but a single hour over the line still deserves a word */
  let peak = 0, at = -1;
  ahead.forEach((v, i) => { if(num(v) && v > peak){ peak = v; at = i + from; } });
  if(peak >= RAIN_PROB) return {kind:'showers', rest, peak, at, part:partOfDay(at)};

  if(num(o.tMax) && o.tMax >= HOT_C) return {kind:'hot', rest, tMax:o.tMax};
  return {kind:'calm', rest};
}

if(typeof module !== 'undefined') module.exports = {rainRuns, partOfDay, summarize, RAIN_PROB};
