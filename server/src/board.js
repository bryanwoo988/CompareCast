/* InfoBanjir's notice board: the posters JPS puts up on
   publicinfobanjir.water.gov.my — early flood forecasts from PRABN (the
   national flood forecasting centre), flood warnings by state. The site's
   own pop-up reads them from a JSON list, one entry per poster with the
   time it goes up and comes down; this reads the same list.

   The app cannot read either the list or the posters itself: the list
   allows no other site, and the posters come back as
   application/octet-stream with nosniff, and sometimes under a name whose
   extension differs in case from the list's ("….jfif" listed, "….JFIF"
   stored). So both come through the worker: GET /board and
   GET /board/file?n=<name>. */

const BOARD_URL = 'https://publicinfobanjir.water.gov.my/wp-content/themes/enlighten/data/floodalertannouncement.json';
const BOARD_FILES = 'https://publicinfobanjir.water.gov.my/wp-content/themes/enlighten/assets/images/shared/';
const BOARD_SITE = 'https://publicinfobanjir.water.gov.my/';

/* a poster's file name: plain characters only, a known extension */
const FILE_RE = /^[A-Za-z0-9][A-Za-z0-9 ._()&,-]{0,150}\.(jpe?g|jfif|png|pdf)$/i;
const MIME = {jpg:'image/jpeg', jpeg:'image/jpeg', jfif:'image/jpeg', png:'image/png', pdf:'application/pdf'};
const mimeOf = name => MIME[String(name).split('.').pop().toLowerCase()] || null;

/* state codes JPS uses in file names, and the names it writes out */
const STATE_CODES = {
  PLS:'Perlis', KDH:'Kedah', KED:'Kedah', PNG:'Pulau Pinang', PPG:'Pulau Pinang', PRK:'Perak',
  SGR:'Selangor', SEL:'Selangor', KUL:'Kuala Lumpur', WPKL:'Kuala Lumpur', PJY:'Putrajaya',
  NSN:'Negeri Sembilan', NS:'Negeri Sembilan', MLK:'Melaka', MEL:'Melaka', JHR:'Johor', JOH:'Johor',
  PHG:'Pahang', PAH:'Pahang', TRG:'Terengganu', TER:'Terengganu', KEL:'Kelantan', KTN:'Kelantan',
  SBH:'Sabah', SAB:'Sabah', SWK:'Sarawak', SAR:'Sarawak', LBN:'Labuan'
};
const STATE_WORDS = [
  [/\bperlis\b/i, 'Perlis'], [/\bkedah\b/i, 'Kedah'], [/\b(pulau pinang|penang)\b/i, 'Pulau Pinang'],
  [/\bperak\b/i, 'Perak'], [/\bselangor\b/i, 'Selangor'], [/\bkuala lumpur\b/i, 'Kuala Lumpur'],
  [/\bputrajaya\b/i, 'Putrajaya'], [/\bnegeri sembilan\b/i, 'Negeri Sembilan'], [/\b(melaka|malacca)\b/i, 'Melaka'],
  [/\bjohor\b/i, 'Johor'], [/\bpahang\b/i, 'Pahang'], [/\bterengganu\b/i, 'Terengganu'],
  [/\bkelantan\b/i, 'Kelantan'], [/\bsabah\b/i, 'Sabah'], [/\bsarawak\b/i, 'Sarawak'], [/\blabuan\b/i, 'Labuan']
];

/* the states a poster is about, from its file name */
function boardStates(name){
  const base = String(name || '').replace(/\.[^.]+$/, '');
  const out = [];
  const add = s => { if(!out.includes(s)) out.push(s); };
  STATE_WORDS.forEach(([re, s]) => { if(re.test(base)) add(s); });
  /* codes only in a coded name (JPS-PRABN-TRG): in words, "KEL" could be
     the start of anything */
  if(!/\s/.test(base)) base.toUpperCase().split(/[^A-Z]+/).forEach(tok => { if(STATE_CODES[tok]) add(STATE_CODES[tok]); });
  return out;
}

/* 'YYYY-MM-DD HH:MM[:SS]' (Malaysian time) → 'YYYY-MM-DDTHH:MM' */
const minute = s => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s)) ? s.slice(0, 10) + 'T' + s.slice(11, 16) : null;

/* The posters up at `nowMyt` ('YYYY-MM-DDTHH:MM', Malaysian time), newest
   first: {id, name, title, kind, states, at, from, to, mime}. `title` is
   the file name without its extension when it reads as words; `kind` is
   'forecast' for a PRABN early flood forecast, else 'notice'. */
function boardItems(list, nowMyt){
  if(!Array.isArray(list)) return [];
  const out = [], seen = new Set();
  for(const x of list){
    if(!x || typeof x !== 'object' || typeof x.MemoName !== 'string' || !FILE_RE.test(x.MemoName)) continue;
    const at = minute(x.MemoDT), from = minute(x.StartPublishDT) || at, to = minute(x.EndPublishDT);
    if(nowMyt && ((from && from > nowMyt) || (to && to <= nowMyt))) continue;
    const id = `${x.MemoName}|${at || ''}`;
    if(seen.has(id)) continue;
    seen.add(id);
    const base = x.MemoName.replace(/\.[^.]+$/, '');
    out.push({id, name:x.MemoName, title:/\s/.test(base) ? base.replace(/\s+/g, ' ').trim() : '',
      kind:/PRABN/i.test(base) || /ramalan/i.test(base) ? 'forecast' : 'notice',
      states:boardStates(x.MemoName), at, from, to, mime:mimeOf(x.MemoName)});
  }
  return out.sort((a, b) => ((b.at || '') > (a.at || '') ? 1 : (b.at || '') < (a.at || '') ? -1 : 0));
}

/* the names to try for a poster: as listed, then with its extension in the
   other case */
function fileCandidates(name){
  if(!FILE_RE.test(String(name || ''))) return [];
  const dot = name.lastIndexOf('.'), base = name.slice(0, dot), ext = name.slice(dot + 1);
  return [...new Set([name, base + '.' + ext.toUpperCase(), base + '.' + ext.toLowerCase()])];
}
const fileUrl = name => BOARD_FILES + encodeURIComponent(name).replace(/%2C/g, ',');

export {BOARD_URL, BOARD_FILES, BOARD_SITE, FILE_RE, boardStates, boardItems, fileCandidates, fileUrl, mimeOf};
