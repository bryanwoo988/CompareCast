/* Storm alerts: the two sources and how a plot is matched to each.

   Official — MetMalaysia's thunderstorm warnings, read from the open API at
   data.gov.my. A warning names places in a sentence, not as data:

     "Ribut petir, hujan lebat dan angin kencang dijangka di negeri
      Terengganu (Kemaman dan Dungun) • Pahang (Kuantan, Pekan dan Rompin) •
      Sabah: Kudat (Pitas dan Kudat) sehingga 12:00 Tengah Hari; …"

   so the Malay text is cut into "state (district, district)" pieces and each
   plot is matched by the state and district the app looked up for it (OSM,
   in Malay, the same spelling MetMalaysia uses). Only Malaysian plots can
   match; everyone else gets the model alert alone.

   Model — a heads-up, not a warning. Only ICON (and now and then UKMO) ever
   writes the thunderstorm weather code over Malaysia; ECMWF, GEM, Météo-France
   and JMA never do (checked against live replies, November 2026), so counting
   models that "say thunderstorm" would almost never reach a majority. A model
   counts here when, in the next three hours, it shows either the
   thunderstorm code, or heavy rain (≥ 5 mm in an hour) falling into an
   unstable atmosphere (CAPE ≥ 1000 J/kg). Three of the seven is the bar.
   CAPE alone was not used: over Malaysia it sits above 2000 most afternoons
   and would alert every day. The thresholds are a rule of thumb, and the
   message says how many models agreed so the reader can weigh it. */

/* every current warning: thunderstorm and continuous rain are picked out
   here, and the feed only ever holds a handful */
const WARN_API = 'https://api.data.gov.my/weather/warning/?limit=50';

const STORM_MODELS = ['ecmwf_ifs025', 'gfs_seamless', 'icon_seamless', 'gem_seamless',
                      'meteofrance_seamless', 'jma_seamless', 'ukmo_seamless'];
const STORM_RAIN_MM = 5, STORM_CAPE = 1000, STORM_HOURS = 3, STORM_MIN_MODELS = 3;
/* one model heads-up per plot per three hours at most: a stalled afternoon
   storm would otherwise buzz on every hourly check */
const MODEL_COOLDOWN_S = 3 * 3600;

/* ISO 3166-2 code → the names MetMalaysia may write the state under */
const STATE_NAMES = {
  'MY-01':['johor'], 'MY-02':['kedah'], 'MY-03':['kelantan'], 'MY-04':['melaka', 'malacca'],
  'MY-05':['negeri sembilan'], 'MY-06':['pahang'], 'MY-07':['pulau pinang', 'penang'],
  'MY-08':['perak'], 'MY-09':['perlis'], 'MY-10':['selangor'], 'MY-11':['terengganu'],
  'MY-12':['sabah'], 'MY-13':['sarawak'], 'MY-14':['kuala lumpur'], 'MY-15':['labuan'],
  'MY-16':['putrajaya']
};

/* lower case, no accents, no "WP"/"Bahagian"/"Daerah" prefixes, single spaces */
function norm(s){
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\bw\.\s*p\.?/g, ' ').replace(/\bwp\b/g, ' ').replace(/wilayah persekutuan/g, ' ')
    .replace(/federal territory( of)?/g, ' ').replace(/\b(bahagian|daerah)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

const splitPlaces = s => String(s).split(/,|\s+dan\s+|\s+and\s+|&/i).map(norm).filter(Boolean);

/* The text of one warning as [{state, places}]. An empty places list means
   the whole state. */
/* Split at top-level commas and "dan"/"and", never inside brackets. */
function topLevel(str){
  const out = [];
  let depth = 0, cur = '';
  for(let i = 0; i < str.length; i++){
    const c = str[i];
    if(c === '(') depth++;
    if(c === ')') depth = Math.max(0, depth - 1);
    if(depth === 0 && c === ','){ out.push(cur); cur = ''; continue; }
    if(depth === 0){
      const m = /^\s+(?:dan|and|&)\s+/i.exec(str.slice(i));
      if(m){ out.push(cur); cur = ''; i += m[0].length - 1; continue; }
    }
    cur += c;
  }
  out.push(cur);
  return out.map(x => x.trim()).filter(Boolean);
}

/* One "•"-separated piece of a warning:
     "Pahang (Kuantan, Pekan dan Rompin)"   state, its districts
     "Terengganu"                           the whole state
     "Sarawak: Miri, Bintulu (Tatau), Kapit (Kapit)"
                                            state, then divisions: a bare
                                            division is all of it, one with a
                                            bracket only the districts named
   Places are the districts and whole divisions; a division that only
   parents a bracket is not one. */
function parseSegment(seg){
  const str = String(seg || '').trim().replace(/\.\s*$/, '');
  if(!str) return null;
  const colon = str.indexOf(':'), paren = str.indexOf('(');
  if(colon >= 0 && (paren < 0 || colon < paren)){
    const places = [];
    topLevel(str.slice(colon + 1)).forEach(item => {
      const m = /^([^(]*?)\s*\((.*)\)\s*$/.exec(item);
      if(m) splitPlaces(m[2]).forEach(x => places.push(x));
      else places.push(norm(item));
    });
    return {state:norm(str.slice(0, colon)), places:places.filter(Boolean)};
  }
  const m = /^([^(]*?)\s*(?:\((.*)\))?\s*$/.exec(str);
  if(!m) return null;
  return {state:norm(m[1]), places:m[2] ? splitPlaces(m[2]) : []};
}

/* A warning's areas, from every section of its Malay text: a thunderstorm
   warning has one ("dijangka di negeri …"), a continuous rain warning may
   have several ("I) … dijangka berlaku di negeri … sehingga …  II) …"). */
function parseAreas(text){
  const s = String(text || '');
  const out = [];
  const lead = /dijangka\s+(?:berlaku\s+)?di\s+(?:negeri|kawasan)?\s*/gi;
  let m;
  while((m = lead.exec(s))){
    let part = s.slice(m.index + m[0].length);
    const tail = /\s+(?:sehingga|dalam\s+tempoh)\s/i.exec(part);
    if(tail) part = part.slice(0, tail.index);
    part.split('•').map(parseSegment).forEach(x => { if(x && (x.state || x.places.length)) out.push(x); });
  }
  return out;
}

/* Does this warning cover a plot whose state and district were looked up? */
function plotInAreas(geo, areas){
  if(!geo || typeof geo.iso !== 'string' || !Array.isArray(areas)) return false;
  const states = new Set((STATE_NAMES[geo.iso] || []).concat(geo.state ? [norm(geo.state)] : []).filter(Boolean));
  if(!states.size) return false;
  const own = [geo.district, geo.division].map(norm).filter(Boolean);
  return areas.some(a => {
    if(states.has(a.state)) return !a.places.length || a.places.some(p => own.includes(p));
    /* Kuala Lumpur, Putrajaya and Perlis have no district of their own and
       may be listed as places under another heading */
    return !own.length && a.places.some(p => states.has(p));
  });
}

/* 'YYYY-MM-DDTHH:MM' — the warnings' own form, Malaysian wall-clock time */
const minuteOf = s => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) ? s.slice(0, 16) : null;

/* A continuous rain warning's level, from its heading: Waspada (Alert),
   Buruk (Bad weather), Bahaya (Danger). */
function rainLevel(w){
  const h = String(w.heading_bm || '') + ' ' + String(w.heading_en || '');
  if(/bahaya|danger/i.test(h)) return 3;
  if(/buruk|bad weather/i.test(h)) return 2;
  return 1;
}

/* The thunderstorm and continuous rain warnings in force or still to come,
   at `nowMyt` ('YYYY-MM-DDTHH:MM', Malaysian time), each with its kind
   ('storm' or 'rain'), level and areas.

   data.gov.my splits one continuous rain warning into a record per start
   date without saying which section each belongs to; records with the same
   issue time and heading are put back together, from the earliest start to
   the latest end. */
function liveWarnings(list, nowMyt){
  if(!Array.isArray(list)) return [];
  const out = [], merged = new Map();
  for(const w of list){
    if(!w || typeof w !== 'object') continue;
    const title = String((w.warning_issue && w.warning_issue.title_en) || '');
    const kind = /thunderstorm/i.test(title) ? 'storm' : /continuous rain/i.test(title) ? 'rain' : null;
    if(!kind) continue;
    const from = minuteOf(w.valid_from), to = minuteOf(w.valid_to);
    const issued = minuteOf(w.warning_issue && w.warning_issue.issued);
    if(!to || to <= nowMyt) continue;
    const areas = parseAreas(w.text_bm || w.text_en);
    if(!areas.length) continue;
    const item = {kind, level:kind === 'rain' ? rainLevel(w) : 1, issued, from, to, areas};
    if(kind !== 'rain'){ out.push(item); continue; }
    const key = `${issued}|${w.heading_bm || w.heading_en || ''}`;
    const had = merged.get(key);
    if(!had){ merged.set(key, item); out.push(item); continue; }
    if(from && (!had.from || from < had.from)) had.from = from;
    if(to > had.to) had.to = to;
  }
  return out;
}

/* How many of the storm models signal a storm in the hours starting at
   `start` (an index into hourly.time). `models` lists the ones that agreed,
   `first` is the earliest hour any of them did. */
function modelSignal(hourly, start){
  const out = {count:0, total:0, models:[], first:null};
  if(!hourly || !Array.isArray(hourly.time) || !(start >= 0)) return out;
  const end = Math.min(hourly.time.length, start + STORM_HOURS);
  const at = (k, i) => { const a = hourly[k]; const v = Array.isArray(a) ? a[i] : null; return typeof v === 'number' && Number.isFinite(v) ? v : null; };
  STORM_MODELS.forEach(m => {
    let has = false, hit = -1;
    for(let i = start; i < end; i++){
      const wc = at('weather_code_' + m, i), p = at('precipitation_' + m, i), c = at('cape_' + m, i);
      if(wc !== null || p !== null) has = true;
      if((wc !== null && wc >= 95) || (p !== null && c !== null && p >= STORM_RAIN_MM && c >= STORM_CAPE)){ hit = i; break; }
    }
    if(has) out.total++;
    if(hit >= 0){
      out.count++; out.models.push(m);
      if(out.first === null || hit < out.first) out.first = hit;
    }
  });
  if(out.first !== null) out.first = String(hourly.time[out.first]).slice(0, 16);
  return out;
}
const modelAlert = sig => !!sig && sig.count >= STORM_MIN_MODELS;

export {rainLevel, WARN_API, STORM_MODELS, STORM_HOURS, STORM_MIN_MODELS, MODEL_COOLDOWN_S, STATE_NAMES,
        norm, parseAreas, plotInAreas, liveWarnings, modelSignal, modelAlert};
