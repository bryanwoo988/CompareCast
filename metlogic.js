/* MetMalaysia's own seven-day forecast, read from data.gov.my. Pure
   functions, kept out of app.js so they run under the tests.

   The forecast is text, per district (and per state), for morning,
   afternoon and night, with the day's lowest and highest temperature. It is
   not for the plot itself: a district is tens of kilometres across.

   A plot's district comes from OpenStreetMap (the same lookup the storm
   alerts use). Most OpenStreetMap district names are MetMalaysia's own;
   the few that are not are mapped below, and a plot whose district cannot
   be matched falls back to its state's forecast. */

var MET_FC_API = 'https://api.data.gov.my/weather/forecast/';

/* MetMalaysia's districts as data.gov.my names them (Nov 2026). The API
   matches names exactly, case included, so a plot's district is looked up
   here first to get MetMalaysia's spelling. */
var MET_DISTRICTS = [
 'Alor Gajah', 'Asajaya', 'Bachok', 'Bagan Datuk', 'Baling', 'Bandar Baharu', 'Barat Daya',
 'Bario', 'Batang Padang', 'Batu Pahat', 'Bau', 'Beaufort', 'Belaga', 'Beluran', 'Beluru',
 'Bentong', 'Bera', 'Besut', 'Betong', 'Bintulu', 'Bukit Mabong', 'Dalat', 'Daro', 'Dungun',
 'Gedong', 'Gombak', 'Gua Musang', 'Hilir Perak', 'Hulu Langat', 'Hulu Perak', 'Hulu Selangor',
 'Hulu Terengganu', 'Jasin', 'Jelebu', 'Jeli', 'Jempol', 'Jerantut', 'Johor Bahru', 'Julau',
 'Kabong', 'Kalabakan', 'Kampar', 'Kanowit', 'Kapit', 'Kemaman', 'Keningau', 'Kerian',
 'Kinabatangan', 'Kinta', 'Klang', 'Kluang', 'Kota Belud', 'Kota Bharu', 'Kota Kinabalu',
 'Kota Marudu', 'Kota Setar', 'Kota Tinggi', 'Kuala Kangsar', 'Kuala Krai', 'Kuala Langat',
 'Kuala Lumpur', 'Kuala Muda', 'Kuala Nerus', 'Kuala Penyu', 'Kuala Pilah', 'Kuala Selangor',
 'Kuala Terengganu', 'Kuantan', 'Kubang Pasu', 'Kuching', 'Kudat', 'Kulai', 'Kulim', 'Kunak',
 'Labuan', 'Labuk & Sugut', 'Lahad Datu', 'Langkawi', 'Larut, Matang Dan Selama', 'Lawas',
 'Limbang', 'Lingga', 'Lipis', 'Lubok Antu', 'Lundu', 'Machang', 'Manjung', 'Maran', 'Marang',
 'Marudi', 'Matu', 'Melaka Tengah', 'Membakut', 'Meradong', 'Mersing', 'Miri', 'Muallim', 'Muar',
 'Mukah', 'Nabawan', 'Padang Terap', 'Pakan', 'Pantu', 'Papar', 'Pasir Mas', 'Pasir Puteh',
 'Pekan', 'Penampang', 'Pendang', 'Perak Tengah', 'Perlis', 'Petaling', 'Pitas', 'Pokok Sena',
 'Pontian', 'Port Dickson', 'Pusa', 'Putatan', 'Putrajaya', 'Ranau', 'Raub', 'Rembau', 'Rompin',
 'Sabak Bernam', 'Samarahan', 'Sandakan', 'Saratok', 'Sarikei', 'Sebauh', 'Seberang Perai Selatan',
 'Seberang Perai Tengah', 'Seberang Perai Utara', 'Sebuyau', 'Segamat', 'Selama', 'Selangau',
 'Semporna', 'Sepang', 'Seremban', 'Serian', 'Setiu', 'Sibu', 'Siburan', 'Sik', 'Simunjan',
 'Sipitang', 'Song', 'Sook', 'Sri Aman', 'Subis', 'Tambunan', 'Tampin', 'Tanah Merah',
 'Tanah Tinggi Cameron', 'Tangkak', 'Tanjung Manis', 'Tatau', 'Tawau', 'Tebedu', 'Telang Usan',
 'Telupid', 'Temerloh', 'Tenom', 'Timur Laut', 'Tongod', 'Tuaran', 'Tumpat', 'Yan'
];

/* OpenStreetMap name → MetMalaysia's, where they differ */
var MET_ALIAS = {'cameron highlands':'Tanah Tinggi Cameron', 'larut matang dan selama':'Larut, Matang Dan Selama',
  'larut matang selama':'Larut, Matang Dan Selama'};
/* territories with no district in OpenStreetMap */
var MET_ISO_DISTRICT = {'MY-09':'Perlis', 'MY-14':'Kuala Lumpur', 'MY-15':'Labuan', 'MY-16':'Putrajaya'};
var MET_STATE = {
  'MY-01':'Johor', 'MY-02':'Kedah', 'MY-03':'Kelantan', 'MY-04':'Melaka', 'MY-05':'Negeri Sembilan',
  'MY-06':'Pahang', 'MY-07':'Pulau Pinang', 'MY-08':'Perak', 'MY-09':'Perlis', 'MY-10':'Selangor',
  'MY-11':'Terengganu', 'MY-12':'Sabah', 'MY-13':'Sarawak', 'MY-14':'WP Kuala Lumpur', 'MY-15':'WP Labuan',
  'MY-16':'WP Putrajaya'
};

function metNorm(s){
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\b(daerah|bahagian)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}

/* Where to look a plot up, best first: [{name, type:'Ds'|'St'}]. Empty for
   a plot outside Malaysia or one not looked up yet. */
function metPlaces(geo){
  if(!geo || typeof geo.iso !== 'string' || !MET_STATE[geo.iso]) return [];
  var out = [], want = [];
  if(MET_ISO_DISTRICT[geo.iso]) want.push(MET_ISO_DISTRICT[geo.iso]);
  [geo.district, geo.division].forEach(function(n){ if(n) want.push(n); });
  for(var i = 0; i < want.length; i++){
    var k = metNorm(want[i]), name = MET_ALIAS[k] || null;
    if(!name) for(var j = 0; j < MET_DISTRICTS.length; j++) if(metNorm(MET_DISTRICTS[j]) === k){ name = MET_DISTRICTS[j]; break; }
    if(name && !out.some(function(x){ return x.name === name; })) out.push({name:name, type:'Ds'});
  }
  out.push({name:MET_STATE[geo.iso], type:'St'});
  return out;
}

var metUrl = function(name){ return MET_FC_API + '?filter=' + encodeURIComponent(name) + '@location__location_name&sort=date'; };

/* The reply → days of the one place of `type`, oldest first, from `today`
   (YYYY-MM-DD) on. A name can be both a district and a town (Bentong), so
   the id's prefix picks the one asked for. */
function metDays(records, type, today){
  if(!Array.isArray(records)) return [];
  var seen = {}, out = [];
  records.forEach(function(r){
    if(!r || !r.location || typeof r.location.location_id !== 'string' || r.location.location_id.slice(0, 2) !== type) return;
    if(typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || seen[r.date]) return;
    if(today && r.date < today) return;
    seen[r.date] = 1;
    var num = function(v){ return typeof v === 'number' && isFinite(v) ? v : null; };
    out.push({date:r.date, am:r.morning_forecast || '', pm:r.afternoon_forecast || '', night:r.night_forecast || '',
      sum:r.summary_forecast || '', when:r.summary_when || '', min:num(r.min_temp), max:num(r.max_temp)});
  });
  return out.sort(function(a, b){ return a.date < b.date ? -1 : 1; });
}

/* Forecast phrase → what kind of weather, for the icon */
function metKind(p){
  var s = metNorm(p);
  if(/ribut petir/.test(s)) return 'storm';
  if(/tiada hujan/.test(s)) return 'none';
  if(/hujan/.test(s)) return 'rain';
  if(/mendung|berawan/.test(s)) return 'cloud';
  return 'none';
}

/* MetMalaysia's phrases are built from a few parts: what (rain,
   thunderstorms), how much of the area (a few places, many places, all of
   it) and sometimes where (inland, coastal). They are translated part by
   part; anything not recognised is shown in Malay as given. */
var MET_WORDS = {
  zh:{none:'无雨', cloud:'阴天', rain:'有雨', storm:'雷雨',
      few:'局部', many:'多处', all:'普遍', inland:'内陆', coast:'沿海'},
  en:{none:'No rain', cloud:'Cloudy', rain:'Rain', storm:'Thunderstorms',
      few:'in a few places', many:'in many places', all:'widespread', inland:'inland', coast:'coastal'}
};
function metPhrase(p, lang){
  if(lang === 'ms' || !MET_WORDS[lang]) return String(p || '');
  var s = metNorm(p), w = MET_WORDS[lang];
  var m = /^(tiada hujan|mendung|hujan|ribut petir)(?: (di beberapa tempat|di kebanyakan tempat|menyeluruh))?(?: di kawasan (pedalaman|pantai))?$/.exec(s);
  if(!m) return String(p || '');
  var what = m[1] === 'tiada hujan' ? 'none' : m[1] === 'mendung' ? 'cloud' : m[1] === 'hujan' ? 'rain' : 'storm';
  var much = m[2] ? (/beberapa/.test(m[2]) ? 'few' : /kebanyakan/.test(m[2]) ? 'many' : 'all') : null;
  var where = m[3] ? (m[3] === 'pedalaman' ? 'inland' : 'coast') : null;
  if(what === 'none' || what === 'cloud') return w[what];
  if(lang === 'zh'){
    var head = (where ? w[where] : '') + (much ? w[much] : '');
    return head + (what === 'rain' ? '有雨' : '雷雨');
  }
  var base = w[what];
  if(much === 'all') base = 'Widespread ' + base.toLowerCase();
  else if(much) base += ' ' + w[much];
  if(where) base += ' (' + w[where] + ')';
  return base;
}

/* summary_when → the parts of the day it names */
var MET_WHEN = {
  zh:{pagi:'早上', petang:'下午', malam:'晚上', all:'全天', and:'和'},
  en:{pagi:'morning', petang:'afternoon', malam:'night', all:'all day', and:' and '}
};
function metWhen(s, lang){
  if(lang === 'ms' || !MET_WHEN[lang]) return String(s || '');
  var k = metNorm(s), w = MET_WHEN[lang];
  if(!k) return '';
  if(k === 'sepanjang hari') return w.all;
  var parts = k.split(' dan ');
  if(!parts.every(function(x){ return w[x] && x !== 'all' && x !== 'and'; })) return String(s);
  return parts.map(function(x){ return w[x]; }).join(w.and);
}

if(typeof module !== 'undefined') module.exports = {MET_FC_API, MET_DISTRICTS, MET_STATE, metNorm, metPlaces, metUrl,
  metDays, metKind, metPhrase, metWhen};
