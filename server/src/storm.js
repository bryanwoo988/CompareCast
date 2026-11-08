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

const WARN_API = 'https://api.data.gov.my/weather/warning/?contains=Thunderstorm@warning_issue__title_en&limit=50';

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
    .replace(/federal territory( of)?/g, ' ').replace(/\b(bahagian|daerah|negeri)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

const splitPlaces = s => String(s).split(/,|\s+dan\s+|\s+and\s+|&/i).map(norm).filter(Boolean);

/* The text of one warning as [{state, places}]. An empty places list means
   the whole state. */
function parseAreas(text){
  let s = String(text || '');
  const lead = /dijangka\s+di\s+(?:negeri|kawasan)?\s*/i.exec(s);
  if(lead) s = s.slice(lead.index + lead[0].length);
  const tail = /\s+sehingga\s/i.exec(s);
  if(tail) s = s.slice(0, tail.index);
  return s.split('•').map(seg => {
    const m = /^\s*([^(:]+?)\s*(?::\s*([^(]+?))?\s*(?:\((.*)\))?\s*\.?\s*$/.exec(seg);
    if(!m) return null;
    /* "Sabah: Kudat (Pitas dan Kudat)": the bracket lists the districts and
       "Kudat" before it is only their division; without a bracket the
       division is the area */
    const places = m[3] ? splitPlaces(m[3]) : (m[2] ? splitPlaces(m[2]) : []);
    return {state:norm(m[1]), places};
  }).filter(x => x && (x.state || x.places.length));
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

/* The thunderstorm warnings in force or still to come, at `nowMyt`
   ('YYYY-MM-DDTHH:MM', Malaysian time), each with its areas parsed. */
function liveWarnings(list, nowMyt){
  if(!Array.isArray(list)) return [];
  return list.map(w => {
    if(!w || typeof w !== 'object') return null;
    const title = w.warning_issue && w.warning_issue.title_en;
    if(!/thunderstorm/i.test(String(title || ''))) return null;
    const from = minuteOf(w.valid_from), to = minuteOf(w.valid_to);
    const issued = minuteOf(w.warning_issue && w.warning_issue.issued);
    if(!to || to <= nowMyt) return null;
    const areas = parseAreas(w.text_bm || w.text_en);
    if(!areas.length) return null;
    return {issued, from, to, areas};
  }).filter(Boolean);
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

export {WARN_API, STORM_MODELS, STORM_HOURS, STORM_MIN_MODELS, MODEL_COOLDOWN_S, STATE_NAMES,
        norm, parseAreas, plotInAreas, liveWarnings, modelSignal, modelAlert};
